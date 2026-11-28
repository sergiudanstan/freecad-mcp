// Regression tests: tool arguments must stay inert data in the Python sent to FreeCAD, and valid
// arguments must keep producing the same Python as on the baseline (a25f3c2).
//
// The tools are discovered, not listed by hand: every dist/tools/*.js exports one `*_TOOLS` array and
// one `handle*Tool(name, args, bridge)`. Each handler is called directly with a fake bridge that
// records the code. A tool REJECTS a call when its handler throws or never calls the bridge.
// freecad_execute_python (arbitrary code by design) is skipped. The captured code is checked by one
// `python3 -I -c` process per test (codes on stdin as JSON); if python3 is missing the test FAILS.
//
// Env:
//   FREECAD_MCP_TOOL_MODULES=draft,sketcher   only these modules (file names in dist/tools without .js);
//                                             fixtures are compared only on their tools' keys;
//                                             an unknown module fails with `Unknown tool module: <name>`.
//   FREECAD_MCP_VALID_ARGS_REPORT=<abs path>          write the rejected "<tool>|<variant>" list (JSON)
//   FREECAD_MCP_VALID_ARGS_PYTHON_REPORT=<abs path>   write {"<tool>|<variant>": sha256} (JSON)
//   FREECAD_MCP_STRING_CONSTANTS_REPORT=<abs path>    write the preserved "<tool>|<prop>" list (JSON)
//
// Injection: after ast.parse, an ast.Name `__PWN__` in Store context or a NamedExpr targeting
// `__PWN__`. Failure messages carry single lines INJECTABLE_TOOLS=[...], SYNTAX_BROKEN_TOOLS=[...],
// PYTHON_CHANGED=[...], MISSING_STRING_CONSTANTS=[...], UNEXERCISED_TOOLS=[...] (sorted JSON arrays).
//
// Reach: a call rejected before the bridge runs no payload, so a payload test proves nothing for a tool
// that rejects every call. DOMAIN gives in-domain values to the properties whose rule the schema does not
// state (tube, prism, mesh_decimate); string payloads run twice, with the enums attacked and with the enums
// valid (once enums are validated the first form is rejected whole); "injection: every tool reaches the
// bridge" fails for a tool that no valid-enum string-payload call reaches.
//
// Valid corpus (CORPUS_VALID): per call every present property takes the variant's value by type.
//   plain: number 2.5, integer 3, boolean true, string 'Box' (property names containing
//          path/file/dir, case-insensitive: '/tmp/freecad-mcp-test/model.step'), enum = first element,
//          array = 3 elements, object = all properties.
//   zero 0 / negative -1.5 (integer -2) / false / dotted 'Box.Face1' / dashed 'my-part' /
//   quoted `Bo"x 'q' \ ă` (paths '/tmp/freecad-mcp-test/a "b".step') / long 'x' * 1000 /
//   enum<i> (i-th element, i < longest enum of the tool) / required-only (only required, plain) /
//   distinct (counter k over every scalar in schema key order, recursive: number 1.5+k, integer 1+k,
//          string s<k> (paths /tmp/freecad-mcp-test/f<k>.step), boolean k even, enum first element;
//          enums advance k too).
//   Variant values replace only scalars of their type (dotted/dashed/long/quoted replace every
//   non-enum string, path properties included unless a path value is given above).
// Python hash: codes parsed in capture order, normalized bottom-up (BinOp Add of two str Constants ->
// one Constant; adjacent str Constants inside a JoinedStr merged), sha256 hex of
// json.dumps([canon(tree) ...]). canon() is a version-independent dump (ast.dump changes format,
// between Python 3.9, 3.13 and 3.15): node type and fields, without ctx/type_ignores/type_params/
// kind/type_comment/is_lazy (3.15) and without fields that are None or []. The quoted variant is never hashed.
// String constants: a key "<tool>|<prop>" is preserved when the raw AST of a captured code holds an
// ast.Constant str exactly equal to the marker.
//
// Beyond the brief (fixed here): injection runs use number 1 / boolean true as the neutral values of
// non-attacked properties (the reference probe's values); array payloads have 3 elements; enum
// properties receive string payloads too; a call whose handler throws after calling the bridge is
// still a rejection for the valid corpus, but its captured codes are checked for injection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOLS_DIR = join(ROOT, 'dist', 'tools');
const FIXTURES = join(ROOT, 'test', 'fixtures');
const SKIP = new Set(['freecad_execute_python']);
const PATH_RE = /path|file|dir/i;
const TEST_DIR = '/tmp/freecad-mcp-test';
// Domain rules the inputSchema does not state, enforced by the handlers before any Python is generated.
// With the generic values every call of these tools is rejected, so their payloads would never reach the
// Python. buildArgs and markerRun set these values whenever the property is present; payloads aimed at
// non-string properties (numericPayloadArgs) still replace them. "injection: every tool reaches the
// bridge" fails for any tool that stays unreachable, so a new rule shows up there instead of hiding.
const DOMAIN = {
  freecad_create_tube: { innerRadius: 0.5 }, // innerRadius < outerRadius
  freecad_create_prism: { sides: 6 }, // 3 <= sides <= 360
  freecad_mesh_decimate: { targetReduction: 0.5 }, // 0.01 <= targetReduction <= 0.99
};
const withDomain = (tool, args) => {
  for (const [p, v] of Object.entries(DOMAIN[tool.name] ?? {})) if (p in args) args[p] = v;
  return args;
};

// ---------------------------------------------------------------- discovery and filter
let loaded;
function load() {
  loaded ??= (async () => {
    const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.js')).sort();
    const all = files.map((f) => f.slice(0, -3));
    const env = process.env.FREECAD_MCP_TOOL_MODULES;
    let wanted = all;
    if (env !== undefined && env.trim() !== '') {
      wanted = env.split(',').map((s) => s.trim()).filter(Boolean);
      for (const m of wanted) if (!all.includes(m)) throw new Error(`Unknown tool module: ${m}`);
    }
    const tools = [];
    for (const mod of wanted) {
      const m = await import(pathToFileURL(join(TOOLS_DIR, `${mod}.js`)).href);
      const lists = Object.entries(m).filter(([k, v]) => k.endsWith('_TOOLS') && Array.isArray(v));
      const handlers = Object.entries(m).filter(([k, v]) => /^handle\w*Tool$/.test(k) && typeof v === 'function');
      assert.equal(lists.length, 1, `${mod}: expected one *_TOOLS export`);
      assert.equal(handlers.length, 1, `${mod}: expected one handle*Tool export`);
      for (const t of lists[0][1]) if (!SKIP.has(t.name)) tools.push({ mod, tool: t, handler: handlers[0][1] });
    }
    assert.ok(tools.length > 0, 'no tools discovered');
    return { tools, names: new Set(tools.map((t) => t.tool.name)) };
  })();
  return loaded;
}

// ---------------------------------------------------------------- calling a handler
async function call({ tool, handler }, args) {
  const codes = [];
  const bridge = {
    run: async (c) => { codes.push(c); return { content: [{ type: 'text', text: 'OK' }] }; },
    execute: async (c) => { codes.push(c); return { success: true, result: {} }; },
  };
  let threw = false;
  try {
    await handler(tool.name, args, bridge);
  } catch {
    threw = true;
  }
  return { codes, rejected: threw || codes.length === 0 };
}

// ---------------------------------------------------------------- python checker
const PY = String.raw`
import ast, hashlib, json, sys

class Norm(ast.NodeTransformer):
    @staticmethod
    def _s(n):
        return isinstance(n, ast.Constant) and isinstance(n.value, str)
    def visit_BinOp(self, node):
        self.generic_visit(node)
        if isinstance(node.op, ast.Add) and self._s(node.left) and self._s(node.right):
            return ast.Constant(value=node.left.value + node.right.value)
        return node
    def visit_JoinedStr(self, node):
        self.generic_visit(node)
        out = []
        for v in node.values:
            if out and self._s(v) and self._s(out[-1]):
                out[-1] = ast.Constant(value=out[-1].value + v.value)
            else:
                out.append(v)
        node.values = out
        return node

SKIP = {"ctx", "type_ignores", "type_params", "kind", "type_comment", "is_lazy"}

def canon(n):
    if isinstance(n, ast.AST):
        parts = [type(n).__name__]
        for f in n._fields:
            if f in SKIP:
                continue
            v = getattr(n, f, None)
            if v is None or v == []:
                continue
            parts.append(f + "=" + canon(v))
        return "(" + " ".join(parts) + ")"
    if isinstance(n, list):
        return "[" + ",".join(canon(x) for x in n) + "]"
    return repr(n)

res = []
for item in json.load(sys.stdin):
    r = {"broken": False, "pwn": False, "hash": None, "found": []}
    trees = []
    markers = set(item.get("markers", []))
    found = set()
    for code in item["codes"]:
        try:
            t = ast.parse(code)
        except (SyntaxError, ValueError):
            r["broken"] = True
            continue
        for n in ast.walk(t):
            if isinstance(n, ast.Name) and n.id == "__PWN__" and isinstance(n.ctx, ast.Store):
                r["pwn"] = True
            if isinstance(n, ast.NamedExpr) and getattr(n.target, "id", "") == "__PWN__":
                r["pwn"] = True
            if markers and isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value in markers:
                found.add(n.value)
        trees.append(t)
    r["found"] = sorted(found)
    if item.get("hash") and not r["broken"]:
        dumps = [canon(Norm().visit(t)) for t in trees]
        r["hash"] = hashlib.sha256(json.dumps(dumps).encode("utf-8")).hexdigest()
    res.append(r)
json.dump(res, sys.stdout)
`;

// items: [{codes, markers?, hash?}] -> [{broken, pwn, hash, found}]
function python(items) {
  const p = spawnSync('python3', ['-I', '-c', PY], {
    input: JSON.stringify(items),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (p.error) throw new Error(`python3 is required for this test: ${p.error.message}`);
  if (p.status !== 0) throw new Error(`python3 checker failed (exit ${p.status}): ${p.stderr}`);
  return JSON.parse(p.stdout);
}

// ---------------------------------------------------------------- argument builder
const kindOf = (s) => (Array.isArray(s?.enum) ? 'enum' : s?.type ?? 'string');

// leaf(kind, propName, schema) gives the value of each scalar; arrays get 3 elements, objects all props.
function build(schema, name, leaf) {
  const k = kindOf(schema);
  if (k === 'array') return [0, 1, 2].map(() => build(schema.items ?? {}, name, leaf));
  if (k === 'object') {
    const o = {};
    for (const [p, s] of Object.entries(schema.properties ?? {})) o[p] = build(s, p, leaf);
    return o;
  }
  return leaf(k, name, schema);
}

function buildArgs(tool, leaf, only) {
  const args = {};
  for (const [p, s] of Object.entries(tool.inputSchema?.properties ?? {})) {
    if (only && !only.includes(p)) continue;
    args[p] = build(s, p, leaf);
  }
  return withDomain(tool, args);
}

const isPath = (name) => PATH_RE.test(name);
const QUOTED = `Bo"x 'q' \\ ă`;

function plainLeaf(kind, name, s) {
  if (kind === 'number') return 2.5;
  if (kind === 'integer') return 3;
  if (kind === 'boolean') return true;
  if (kind === 'enum') return s.enum[0];
  return isPath(name) ? `${TEST_DIR}/model.step` : 'Box';
}

function variantLeaf(variant) {
  const str = (v) => (kind, name, s) => (kind === 'string' ? v : plainLeaf(kind, name, s));
  switch (variant) {
    case 'plain':
    case 'required-only':
      return plainLeaf;
    case 'zero':
      return (k, n, s) => (k === 'number' || k === 'integer' ? 0 : plainLeaf(k, n, s));
    case 'negative':
      return (k, n, s) => (k === 'number' ? -1.5 : k === 'integer' ? -2 : plainLeaf(k, n, s));
    case 'false':
      return (k, n, s) => (k === 'boolean' ? false : plainLeaf(k, n, s));
    case 'dotted':
      return str('Box.Face1');
    case 'dashed':
      return str('my-part');
    case 'long':
      return str('x'.repeat(1000));
    case 'quoted':
      return (k, n, s) => (k === 'string' ? (isPath(n) ? `${TEST_DIR}/a "b".step` : QUOTED) : plainLeaf(k, n, s));
    case 'distinct': {
      let c = 0;
      return (k, n, s) => {
        const i = c++;
        if (k === 'number') return 1.5 + i;
        if (k === 'integer') return 1 + i;
        if (k === 'boolean') return i % 2 === 0;
        if (k === 'enum') return s.enum[0];
        return isPath(n) ? `${TEST_DIR}/f${i}.step` : `s${i}`;
      };
    }
    default: {
      const i = Number(variant.slice(4));
      return (k, n, s) => (k === 'enum' ? s.enum[Math.min(i, s.enum.length - 1)] : plainLeaf(k, n, s));
    }
  }
}

function longestEnum(schema) {
  let n = Array.isArray(schema?.enum) ? schema.enum.length : 0;
  if (schema?.items) n = Math.max(n, longestEnum(schema.items));
  for (const s of Object.values(schema?.properties ?? {})) n = Math.max(n, longestEnum(s));
  return n;
}

const BASE_VARIANTS = ['plain', 'zero', 'negative', 'false', 'dotted', 'dashed', 'quoted', 'long', 'required-only', 'distinct'];
const HASHED = new Set(['plain', 'zero', 'negative', 'false', 'dotted', 'dashed', 'long', 'distinct', 'required-only']);

function variantsOf(tool) {
  const v = [...BASE_VARIANTS];
  for (let i = 0; i < longestEnum(tool.inputSchema); i++) v.push(`enum${i}`);
  return v;
}

// ---------------------------------------------------------------- corpus run (shared by the valid-args tests)
let corpus;
function runCorpus() {
  corpus ??= (async () => {
    const { tools } = await load();
    const runs = [];
    for (const t of tools) {
      for (const variant of variantsOf(t.tool)) {
        const leaf = variantLeaf(variant);
        const only = variant === 'required-only' ? t.tool.inputSchema?.required ?? [] : undefined;
        const r = await call(t, buildArgs(t.tool, leaf, only));
        runs.push({ key: `${t.tool.name}|${variant}`, tool: t.tool.name, variant, ...r });
      }
    }
    return runs;
  })();
  return corpus;
}

// ---------------------------------------------------------------- helpers
const sortedUnique = (xs) => [...new Set(xs)].sort();
const toolOf = (key) => key.split('|')[0];

function readFixture(file) {
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
}

function report(envName, value) {
  const p = process.env[envName];
  if (p) writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

function injectionVerdict(results) {
  const pwn = sortedUnique(results.filter((r) => r.pwn).map((r) => r.tool));
  const broken = sortedUnique(results.filter((r) => r.broken).map((r) => r.tool));
  return { pwn, broken, failed: pwn.length > 0 || broken.length > 0 };
}

function verdictLines({ pwn, broken }) {
  return [`INJECTABLE_TOOLS=${JSON.stringify(pwn)}`, `SYNTAX_BROKEN_TOOLS=${JSON.stringify(broken)}`];
}

// Run each tool once per payload set; check every captured code.
async function runInjection(leafs) {
  const { tools } = await load();
  const calls = [];
  for (const leaf of leafs) {
    for (const t of tools) {
      const r = await call(t, buildArgs(t.tool, leaf));
      calls.push({ tool: t.tool.name, codes: r.codes, validEnums: leaf.validEnums === true });
    }
  }
  const out = python(calls.map((c) => ({ codes: c.codes })));
  return calls.map((c, i) => ({ tool: c.tool, reached: c.codes.length > 0, validEnums: c.validEnums, ...out[i] }));
}

// String markers: one call per tool, every top-level non-enum string property gets its marker.
async function markerRun(marker, pathMarker) {
  const { tools } = await load();
  const calls = [];
  for (const t of tools) {
    const props = Object.entries(t.tool.inputSchema?.properties ?? {}).filter(([, s]) => kindOf(s) === 'string');
    const markers = {};
    for (const [p] of props) markers[p] = isPath(p) ? pathMarker(p) : marker(p);
    const args = {};
    for (const [p, s] of Object.entries(t.tool.inputSchema?.properties ?? {})) {
      args[p] = p in markers ? markers[p] : build(s, p, plainLeaf);
    }
    const r = await call(t, withDomain(t.tool, args));
    calls.push({ tool: t.tool.name, markers, ...r });
  }
  const out = python(calls.map((c) => ({ codes: c.codes, markers: Object.values(c.markers) })));
  const keys = [];
  calls.forEach((c, i) => {
    const found = new Set(out[i].found);
    for (const [p, m] of Object.entries(c.markers)) if (found.has(m)) keys.push(`${c.tool}|${p}`);
  });
  return { calls, out, keys: sortedUnique(keys) };
}

// ---------------------------------------------------------------- injection tests
const NUM_PAYLOADS = ['1\n__PWN__=1\n', '1;__PWN__=1', '(__PWN__:=1)'];
const STR_PAYLOADS = [
  'a"\n__PWN__=1\n#',
  "a';__PWN__=1;'",
  'a";__PWN__=1;"',
  "a'''\n__PWN__=1\n'''",
  '/tmp/a";__PWN__=1;"',
  "/tmp/a';__PWN__=1;'",
  'a")\n__PWN__=1\nraise ValueError("b',
  "a')\n__PWN__=1\nraise ValueError('b",
  'a"]\n__PWN__=1\n_z=["b',
];

// neutral values for the properties that are not attacked
function neutralLeaf(kind, name, s) {
  if (kind === 'number' || kind === 'integer') return 1;
  if (kind === 'boolean') return true;
  if (kind === 'enum') return s.enum[0];
  return isPath(name) ? `${TEST_DIR}/model.step` : 'Box';
}

// payload p in every non-string top-level property, and in every element of arrays/objects
function numericPayloadArgs(tool, p) {
  const args = {};
  for (const [name, s] of Object.entries(tool.inputSchema?.properties ?? {})) {
    const k = kindOf(s);
    if (k === 'array' || k === 'object') args[name] = build(s, name, () => p);
    else if (k === 'number' || k === 'integer' || k === 'boolean') args[name] = p;
    else args[name] = neutralLeaf(k, name, s);
  }
  return args;
}

test('injection: numeric, boolean, array and object payloads', async () => {
  const { tools } = await load();
  const calls = [];
  for (const p of NUM_PAYLOADS) {
    for (const t of tools) {
      const r = await call(t, numericPayloadArgs(t.tool, p));
      calls.push({ tool: t.tool.name, codes: r.codes });
    }
  }
  const out = python(calls.map((c) => ({ codes: c.codes })));
  const v = injectionVerdict(calls.map((c, i) => ({ tool: c.tool, ...out[i] })));
  if (v.failed) assert.fail(['non-string payloads reach the Python code', ...verdictLines(v)].join('\n'));
});

// Each payload twice: in every string and enum property, and in every string property with the enums
// valid. Once enums are validated, the first form is rejected whole for a tool with an enum, so only the
// second form carries the payload into that tool's strings.
function stringPayloadLeafs() {
  return STR_PAYLOADS.flatMap((p) => {
    const all = (k, n, s) => (k === 'string' || k === 'enum' ? p : neutralLeaf(k, n, s));
    const strOnly = Object.assign((k, n, s) => (k === 'string' ? p : neutralLeaf(k, n, s)), { validEnums: true });
    return [all, strOnly];
  });
}
let stringRun;
const runStringPayloads = () => (stringRun ??= runInjection(stringPayloadLeafs()));

test('injection: string payloads', async () => {
  const v = injectionVerdict(await runStringPayloads());
  if (v.failed) assert.fail(['string payloads reach the Python code', ...verdictLines(v)].join('\n'));
});

// A payload test is only as good as the calls that reach the bridge: a tool whose every call is rejected
// (a domain rule, an enum, a stricter check) passes the injection tests without running any payload.
test('injection: every tool reaches the bridge', async () => {
  const { names } = await load();
  const reached = new Set((await runStringPayloads()).filter((c) => c.validEnums && c.reached).map((c) => c.tool));
  const unexercised = [...names].filter((n) => !reached.has(n)).sort();
  if (unexercised.length) {
    assert.fail([
      `${unexercised.length} tools reject every string-payload call, so no payload reaches their Python`,
      `UNEXERCISED_TOOLS=${JSON.stringify(unexercised)}`,
    ].join('\n'));
  }
});

test('injection: valid strings produce parseable python', async () => {
  const value = `Bo"x 'q' \\ ă\nz`;
  const leaf = (k, n, s) => (k === 'string' ? (isPath(n) ? `${TEST_DIR}/${value}.step` : value) : neutralLeaf(k, n, s));
  const v = injectionVerdict(await runInjection([leaf]));
  if (v.failed) assert.fail(['valid strings with quotes, backslash, newline or diacritics break the Python', ...verdictLines(v)].join('\n'));
});

test('injection: quoted string values preserved', async () => {
  const { names } = await load();
  const { calls, out, keys } = await markerRun((p) => `mkp_${p} Bo"x 'q' \\ ă`, (p) => `${TEST_DIR}/mkp_${p} a "b".step`);
  const v = injectionVerdict(calls.map((c, i) => ({ tool: c.tool, ...out[i] })));
  const rejectedBaseline = new Set(readFixture('valid-args-baseline.json'));
  const rejectedNow = new Set(calls.filter((c) => c.rejected).map((c) => c.tool));
  const got = new Set(keys);
  const missing = readFixture('string-constants-baseline.json')
    .filter((k) => names.has(toolOf(k)) && !got.has(k))
    .filter((k) => !(rejectedNow.has(toolOf(k)) && rejectedBaseline.has(`${toolOf(k)}|quoted`)));
  if (v.failed || missing.length) {
    assert.fail([
      'quoted string values do not reach the Python code exactly',
      `MISSING_STRING_CONSTANTS=${JSON.stringify(sortedUnique(missing))}`,
      ...verdictLines(v),
    ].join('\n'));
  }
});

// ---------------------------------------------------------------- valid-args tests
// 3.0.0 applies validateFilePath (absolute path, no `..`, no system folders) to the path properties
// that did not have it. Their relative-path variants (dashed 'my-part', dotted 'Box.Face1', long 'xxx…')
// were accepted on the baseline and are rejected on purpose now; every other call is unchanged.
const PATH_POLICY_TOOLS = [
  'freecad_draft_shapestring', 'freecad_export_ifc', 'freecad_open_document',
  'freecad_save_document', 'freecad_techdraw_export_dxf', 'freecad_techdraw_export_svg',
];
const INTENDED_REJECTIONS = new Set(
  PATH_POLICY_TOOLS.flatMap((t) => ['dashed', 'dotted', 'long'].map((v) => `${t}|${v}`)),
);

test('valid args: no new rejections', async () => {
  const { names } = await load();
  const rejected = sortedUnique((await runCorpus()).filter((r) => r.rejected).map((r) => r.key));
  report('FREECAD_MCP_VALID_ARGS_REPORT', rejected);
  const baseline = new Set(readFixture('valid-args-baseline.json').filter((k) => names.has(toolOf(k))));
  const fresh = rejected.filter((k) => !baseline.has(k) && !INTENDED_REJECTIONS.has(k));
  if (fresh.length) assert.fail(`valid arguments newly rejected (${fresh.length}):\nNEW_REJECTIONS=${JSON.stringify(fresh)}`);
  const notRejected = [...INTENDED_REJECTIONS].filter((k) => !rejected.includes(k));
  if (notRejected.length) assert.fail(`relative paths accepted where validateFilePath applies:\nNOT_REJECTED=${JSON.stringify(notRejected)}`);
});

test('valid args: same python as baseline', async () => {
  const { names } = await load();
  const runs = (await runCorpus()).filter((r) => !r.rejected && HASHED.has(r.variant.startsWith('enum') ? 'plain' : r.variant));
  const out = python(runs.map((r) => ({ codes: r.codes, hash: true })));
  const hashes = {};
  const broken = new Set();
  runs.forEach((r, i) => {
    if (out[i].hash) hashes[r.key] = out[i].hash;
    else broken.add(r.key);
  });
  const sorted = Object.fromEntries(Object.keys(hashes).sort().map((k) => [k, hashes[k]]));
  report('FREECAD_MCP_VALID_ARGS_PYTHON_REPORT', sorted);
  const fixture = readFixture('valid-args-python.json');
  const changed = Object.keys(fixture).filter((k) => names.has(toolOf(k)) && !INTENDED_REJECTIONS.has(k) && hashes[k] !== fixture[k]);
  if (changed.length) {
    assert.fail([
      `generated Python differs from the baseline for ${changed.length} valid calls: ${changed.slice(0, 20).join(', ')}`,
      `PYTHON_CHANGED=${JSON.stringify(sortedUnique(changed.map(toolOf)))}`,
      `unparseable: ${JSON.stringify(changed.filter((k) => broken.has(k)))}`,
    ].join('\n'));
  }
});

test('valid args: string values preserved', async () => {
  const { names } = await load();
  const { keys } = await markerRun((p) => `mkp_${p}`, (p) => `${TEST_DIR}/mkp_${p}.step`);
  report('FREECAD_MCP_STRING_CONSTANTS_REPORT', keys);
  const got = new Set(keys);
  const missing = readFixture('string-constants-baseline.json').filter((k) => names.has(toolOf(k)) && !got.has(k));
  if (missing.length) assert.fail(`string values no longer reach the Python code exactly\nMISSING_STRING_CONSTANTS=${JSON.stringify(missing)}`);
});

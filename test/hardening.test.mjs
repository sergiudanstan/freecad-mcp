// Checks that close the residual risks left after 2.0.0:
// - every handle*Tool runs validateToolArgs itself (a handler whose call was removed or commented out
//   fails here, even when its own code happens to be inert);
// - validateFilePath on the path properties that did not have it before 3.0.0;
// - the stdio server removes its private REPL folder and stops FreeCAD when the client goes away;
// - the version reported by src/index.ts is the one in package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOLS_DIR = join(ROOT, 'dist', 'tools');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadTools() {
  const out = [];
  for (const f of fs.readdirSync(TOOLS_DIR).filter((x) => x.endsWith('.js')).sort()) {
    const m = await import(pathToFileURL(join(TOOLS_DIR, f)).href);
    const list = Object.entries(m).find(([k, v]) => k.endsWith('_TOOLS') && Array.isArray(v))[1];
    const handler = Object.entries(m).find(([k, v]) => /^handle\w*Tool$/.test(k) && typeof v === 'function')[1];
    for (const tool of list) out.push({ mod: f, tool, handler });
  }
  return out;
}

async function call(handler, name, args) {
  const codes = [];
  const bridge = {
    run: async (c) => { codes.push(c); return { content: [{ type: 'text', text: 'OK' }] }; },
    execute: async (c) => { codes.push(c); return { success: true, result: {} }; },
  };
  try {
    await handler(name, args, bridge);
    return { codes, error: null };
  } catch (e) {
    return { codes, error: String(e?.message ?? e) };
  }
}

test('every handler validates its arguments against the schema first', async () => {
  const tools = await loadTools();
  assert.equal(tools.length, 165);
  const missing = [];
  for (const { mod, tool, handler } of tools) {
    // An array is not a plain object: only validateToolArgs gives exactly this error, before any code.
    const { codes, error } = await call(handler, tool.name, []);
    if (codes.length || error !== `Invalid arguments for ${tool.name}: must be an object`) {
      missing.push(`${mod}:${tool.name} -> ${codes.length ? 'reached the bridge' : error}`);
    }
  }
  assert.deepEqual(missing, [], `handlers that do not run validateToolArgs first:\n${missing.join('\n')}`);
});

// Plain in-schema values, like the valid corpus of injection.test.mjs.
function plain(schema, name) {
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case 'number': return 2.5;
    case 'integer': return 3;
    case 'boolean': return true;
    case 'array': return [0, 1, 2].map(() => plain(schema.items ?? { type: 'string' }, name));
    case 'object': return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, s]) => [k, plain(s, k)]));
    default: return /path|file|dir/i.test(name) ? '/tmp/freecad-mcp-test/model.step' : 'Box';
  }
}

const PATH_PROPS = [
  ['freecad_open_document', 'filePath'],
  ['freecad_save_document', 'filePath'],
  ['freecad_export_ifc', 'filePath'],
  ['freecad_techdraw_export_svg', 'filePath'],
  ['freecad_techdraw_export_dxf', 'filePath'],
  ['freecad_draft_shapestring', 'fontFile'],
];

test('path properties reject relative, traversing and system paths', async () => {
  const tools = await loadTools();
  for (const [name, prop] of PATH_PROPS) {
    const t = tools.find((x) => x.tool.name === name);
    assert.ok(t, `${name} not found`);
    const base = plain(t.tool.inputSchema, '');
    const ok = await call(t.handler, name, base);
    assert.equal(ok.error, null, `${name}: control call with an absolute path was rejected: ${ok.error}`);
    assert.ok(ok.codes.length > 0, `${name}: control call did not reach the bridge`);
    for (const [bad, why] of [
      ['model.step', /must be an absolute path/],
      ['/tmp/../etc/passwd', /path traversal/],
      ['/etc/freecad.step', /access to \/etc\/ is not allowed/],
    ]) {
      const r = await call(t.handler, name, { ...base, [prop]: bad });
      assert.equal(r.codes.length, 0, `${name}.${prop}=${bad} reached the bridge`);
      assert.match(r.error ?? '', why, `${name}.${prop}=${bad}`);
    }
  }
});

test('the stdio server removes its REPL folder and stops FreeCAD when the client disconnects', async () => {
  const base = fs.mkdtempSync(join(os.tmpdir(), 'fcmcp-exit-'));
  try {
    const app = join(base, 'X', 'Contents', 'Resources');
    fs.mkdirSync(join(app, 'bin'), { recursive: true });
    fs.mkdirSync(join(app, 'lib'), { recursive: true });
    const pidLog = join(base, 'pids.log');
    fs.writeFileSync(join(app, 'bin', 'python'), `#!/bin/bash\necho $$ >> '${pidLog}'\nexec python3 "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(join(app, 'lib', 'FreeCAD.py'),
      'class Units:\n    class Quantity:\n        pass\n\n\nclass Vector:\n    pass\n\n\nActiveDocument = None\n');
    fs.writeFileSync(join(app, 'lib', 'Part.py'), '');
    const tmp = join(base, 'tmp');
    const home = join(base, 'home');
    fs.mkdirSync(tmp);
    fs.mkdirSync(home);

    const client = new Client({ name: 'freecad-mcp-test', version: '0.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'dist', 'index.js')],
      env: { ...process.env, TMPDIR: tmp, HOME: home, FREECAD_CMD: join(app, 'bin', 'freecadcmd') },
      stderr: 'ignore',
    });
    await client.connect(transport);
    const serverPid = transport.pid;
    const killServer = () => { try { process.kill(serverPid, 'SIGKILL'); } catch { /* gone */ } };
    try {
    // Any call starts the headless REPL; its result does not matter here.
    await client.callTool({ name: 'freecad_new_document', arguments: { name: 'Exit' } });
    const folders = () => fs.readdirSync(tmp).filter((f) => f.startsWith('freecad-mcp-'));
    assert.equal(folders().length, 1, 'control: the headless call did not create its REPL folder');
    const replPids = fs.readFileSync(pidLog, 'utf8').split('\n').filter(Boolean).map(Number);
    assert.ok(replPids.length >= 1, 'control: no REPL process was started');

    await client.close(); // closes the server's stdin
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const deadline = Date.now() + 5000;
    while ((alive(serverPid) || folders().length) && Date.now() < deadline) await sleep(50);
    assert.equal(alive(serverPid), false, 'the server process is still running after the client closed');
    assert.deepEqual(folders(), [], 'the private REPL folder was left in TMPDIR');
    for (const pid of replPids) assert.equal(alive(pid), false, `REPL process ${pid} is still running`);
    } finally {
      await client.close().catch(() => {});
      killServer();
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the version reported by the server is the package version', () => {
  const { version } = JSON.parse(fs.readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const src = fs.readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8');
  const found = [...src.matchAll(/version: '([^']+)'|Server v([0-9][^ ]*) running/g)].map((m) => m[1] ?? m[2]);
  assert.equal(found.length, 2, `expected the MCP version and the stderr banner in src/index.ts, found ${JSON.stringify(found)}`);
  for (const v of found) assert.equal(v, version, 'src/index.ts reports a version other than package.json');
});

test('prototype keys cannot smuggle values past the validator', async () => {
  const { validateToolArgs } = await import(pathToFileURL(join(ROOT, 'dist', 'validation.js')).href);
  const tools = [{
    name: 't',
    inputSchema: { type: 'object', properties: { o: { type: 'object', properties: { a: { type: 'number' } } }, r: { type: 'number' } } },
  }];
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const o = JSON.parse(`{${JSON.stringify(key)}: {"a": "1); __PWN__ = 1; ("}}`);
    assert.throws(() => validateToolArgs(tools, 't', { o }), /is not an allowed property/, `nested key ${key}`);
  }
  // An args object whose prototype carries a value (as an unsafe copy of {"__proto__": {...}} would
  // produce) is not a plain object: a handler reading args.r would otherwise see the unvalidated string.
  const polluted = Object.create({ r: '1); __PWN__ = 1; (' });
  assert.throws(() => validateToolArgs(tools, 't', polluted), /must be an object/);
  // A JSON own key "__proto__" is only data: nothing in it becomes a property.
  const own = JSON.parse('{"__proto__": {"r": "1); __PWN__ = 1; ("}}');
  validateToolArgs(tools, 't', own);
  assert.equal(own.r, undefined);
});

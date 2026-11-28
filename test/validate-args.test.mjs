// Unit tests for the central argument validator, written before it exists.
//
// CONTRACT (src/validation.ts):
//   export function validateToolArgs(tools, name, args): void
//   - tools: [{ name, inputSchema: { properties?, required? } }]; synchronous, no I/O.
//   - error: new Error whose message starts exactly with `Invalid argument "<path>" for <tool>: `
//     (path like `points[2].x`, `options.mode`); the value, if shown, is JSON.stringify'd and cut
//     to <= 80 characters.
//   - tool not in the list -> Error `Unknown tool: <name>`.
//   - required missing (undefined or null) -> error; optional undefined/null -> accepted;
//     unknown top-level keys -> ignored.
//   - number: typeof number and finite; integer: Number.isInteger; boolean: typeof boolean;
//     string: typeof string, length <= 4096 (no limit for `code` of freecad_execute_python),
//     empty string accepted; enum: strict equality with one element.
//   - array: Array.isArray, <= 10000 elements, each checked against `items`
//     (no items: scalar = finite number / boolean / string <= 4096).
//   - object: plain object (not array, not null); with `properties`: unknown keys -> error,
//     inner `required` applied, recursive; without `properties`: every value a scalar as above.
//   - property without `type`: scalar as above. No domain checks (no minimum/maximum, no MAX_DIMENSION).
//
// Thresholds used here: string 4096 accepted / 4097 rejected; array 10000 accepted / 10001 rejected;
// `code` of freecad_execute_python accepted at 100000 characters; the 4097-character value must not
// appear in the message as a run of more than 80 characters.
//
// Beyond the contract (fixed by these tests, read the natural way):
//   - for an unknown key or a missing inner required key, the path may name the object
//     (`opts`, `pts[1]`) or the key itself (`opts.extra`, `pts[1].x`); both are accepted;
//   - `Unknown tool: <name>` may be followed by more text, but not preceded;
//   - integers are accepted for `number`, and 3.0 is an integer;
//   - a nested optional property that is absent is accepted (only top-level null is promised);
//   - the whole message for a 4097-character string stays under prefix + 80 + 200 characters.
//
// Every test calls v.validateToolArgs in its body first, so on a build without the function each
// test fails with `TypeError: v.validateToolArgs is not a function`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../dist/validation.js';

const TOOLS = [
  {
    name: 't_all',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'number' },
        i: { type: 'integer' },
        b: { type: 'boolean' },
        s: { type: 'string' },
        code: { type: 'string' },
        e: { type: 'string', enum: ['fast', 'slow', 'auto'] },
        nums: { type: 'array', items: { type: 'number' } },
        pts: {
          type: 'array',
          items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x'] },
        },
        free: { type: 'array' },
        opts: {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['a', 'b'] }, depth: { type: 'integer' } },
          required: ['mode'],
        },
        bag: { type: 'object' },
        any: {},
      },
      required: ['n'],
    },
  },
  {
    name: 'freecad_execute_python',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
  },
];

// Expect the call to throw an Error whose message starts exactly with the contract prefix for one
// of the given paths; returns the message.
function rejects(fn, tool, paths) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof Error, `expected an Error for ${paths.join(' | ')}, got ${err === undefined ? 'no error' : String(err)}`);
  const ok = paths.some((p) => err.message.startsWith(`Invalid argument "${p}" for ${tool}: `));
  assert.ok(ok, `message ${JSON.stringify(err.message)} does not start with Invalid argument "${paths.join('" or "')}" for ${tool}: `);
  return err.message;
}

test('validateToolArgs accepts valid arguments of every type and returns undefined', () => {
  const r = v.validateToolArgs(TOOLS, 't_all', {
    n: 2.5,
    i: 3,
    b: false,
    s: 'Box.Face1 "q" \\ ă',
    e: 'slow',
    nums: [0, -1.5, 3],
    pts: [{ x: 1 }, { x: -2, y: 0 }],
    free: [1, true, 'a'],
    opts: { mode: 'b', depth: 2 },
    bag: { k: 1, f: false, t: '' },
    any: 'x',
  });
  assert.equal(r, undefined);
  for (const args of [{ n: 0 }, { n: -1e9 }, { n: 1e12 }, { n: 3, i: -4 }, { n: 1, i: 3.0 }, { n: 1, s: '' }]) {
    assert.doesNotThrow(() => v.validateToolArgs(TOOLS, 't_all', args), JSON.stringify(args));
  }
});

test('validateToolArgs ignores unknown top-level keys and accepts optional null/undefined', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, extra: { deep: [NaN] }, other: 'x'.repeat(10000) });
  for (const k of ['i', 'b', 's', 'e', 'nums', 'pts', 'free', 'opts', 'bag', 'any']) {
    assert.doesNotThrow(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, [k]: null }), `${k}: null`);
    assert.doesNotThrow(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, [k]: undefined }), `${k}: undefined`);
  }
});

test('validateToolArgs rejects a missing required argument (undefined or null)', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1 });
  rejects(() => v.validateToolArgs(TOOLS, 't_all', {}), 't_all', ['n']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: undefined }), 't_all', ['n']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: null }), 't_all', ['n']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: {} }), 't_all', ['opts', 'opts.mode']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: { mode: null } }), 't_all', ['opts', 'opts.mode']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, pts: [{ x: 1 }, { y: 2 }] }), 't_all', ['pts[1]', 'pts[1].x']);
});

test('validateToolArgs rejects non-finite numbers and non-numbers', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: Number.MAX_VALUE });
  for (const bad of [NaN, Infinity, -Infinity, '5', '1\n__PWN__=1\n', '(__PWN__:=1)', true, [1], { v: 1 }]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: bad }), 't_all', ['n']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, nums: [1, NaN, 2] }), 't_all', ['nums[1]']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, pts: [{ x: 1 }, { x: 2 }, { x: '1;__PWN__=1' }] }), 't_all', ['pts[2].x']);
});

test('validateToolArgs rejects non-integers for integer and non-booleans for boolean', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, i: 0, b: true });
  for (const bad of [1.5, NaN, Infinity, '3']) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, i: bad }), 't_all', ['i']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: { mode: 'a', depth: 2.5 } }), 't_all', ['opts.depth']);
  for (const bad of ['true', 1, 0, 'False', [true]]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, b: bad }), 't_all', ['b']);
  }
});

test('validateToolArgs limits strings to 4096 characters except code of freecad_execute_python', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, s: 'x'.repeat(4096) });
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, s: 'x'.repeat(4097) }), 't_all', ['s']);
  // a property called `code` on another tool is not exempt
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, code: 'x'.repeat(4097) }), 't_all', ['code']);
  assert.doesNotThrow(() => v.validateToolArgs(TOOLS, 'freecad_execute_python', { code: 'x'.repeat(100000) }));
  for (const bad of [1, true, ['a'], { a: 1 }]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, s: bad }), 't_all', ['s']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 'freecad_execute_python', { code: 5 }), 'freecad_execute_python', ['code']);
  rejects(() => v.validateToolArgs(TOOLS, 'freecad_execute_python', {}), 'freecad_execute_python', ['code']);
});

test('validateToolArgs checks enum values with strict equality', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, e: 'auto', opts: { mode: 'a' } });
  for (const bad of ['FAST', 'fast ', '', 'a";__PWN__=1;"', 0]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, e: bad }), 't_all', ['e']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: { mode: 'c' } }), 't_all', ['opts.mode']);
});

test('validateToolArgs checks arrays: type, length 10000 and items', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, nums: new Array(10000).fill(1), free: [] });
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, nums: new Array(10001).fill(1) }), 't_all', ['nums']);
  for (const bad of ['1,2,3', { 0: 1, length: 1 }, 5]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, nums: bad }), 't_all', ['nums']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, pts: [{ x: 1 }, [1, 2]] }), 't_all', ['pts[1]']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, pts: [{ x: 1 }, null] }), 't_all', ['pts[1]']);
  // items without a schema: scalars only
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, free: [1, { a: 1 }] }), 't_all', ['free[1]']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, free: [[1]] }), 't_all', ['free[0]']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, free: [Infinity] }), 't_all', ['free[0]']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, free: ['a', 'x'.repeat(4097)] }), 't_all', ['free[1]']);
});

test('validateToolArgs checks objects: plain object, unknown keys, free-form values', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: { mode: 'a' }, bag: {} });
  for (const bad of [[], 'mode=a', 3]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: bad }), 't_all', ['opts']);
  }
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, opts: { mode: 'a', extra: 1 } }), 't_all', ['opts', 'opts.extra']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, pts: [{ x: 1, z: 2 }] }), 't_all', ['pts[0]', 'pts[0].z']);
  // object without properties: every value a scalar
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, bag: { k: { deep: 1 } } }), 't_all', ['bag.k']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, bag: { k: [1] } }), 't_all', ['bag.k']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, bag: { k: NaN } }), 't_all', ['bag.k']);
  rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, bag: { k: 'x'.repeat(4097) } }), 't_all', ['bag.k']);
  // property without a type: scalar only
  for (const ok of [1, false, 'abc']) v.validateToolArgs(TOOLS, 't_all', { n: 1, any: ok });
  for (const bad of [{ a: 1 }, [1], NaN, 'x'.repeat(4097)]) {
    rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, any: bad }), 't_all', ['any']);
  }
});

test('validateToolArgs applies no domain checks (no minimum, maximum or MAX_DIMENSION)', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1e7, i: -1000000000, nums: [-1e300, 1e300] });
  assert.doesNotThrow(() => v.validateToolArgs(TOOLS, 't_all', { n: -0, pts: [{ x: 1e9, y: -1e9 }] }));
});

test('validateToolArgs rejects an unknown tool with "Unknown tool: <name>"', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1 });
  assert.throws(() => v.validateToolArgs(TOOLS, 'freecad_nope', { n: 1 }), (e) => e instanceof Error && /^Unknown tool: freecad_nope\b/.test(e.message));
  assert.throws(() => v.validateToolArgs([], 't_all', {}), (e) => e instanceof Error && /^Unknown tool: t_all\b/.test(e.message));
});

test('validateToolArgs truncates the value in the message to at most 80 characters', () => {
  v.validateToolArgs(TOOLS, 't_all', { n: 1, s: 'y'.repeat(4096) });
  const m1 = rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, s: 'x'.repeat(4097) }), 't_all', ['s']);
  assert.ok(!m1.includes('x'.repeat(80)), `message keeps more than 80 characters of the value: ${m1.length} chars`);
  const m2 = rejects(() => v.validateToolArgs(TOOLS, 't_all', { n: 1, free: [{ k: 'z'.repeat(500) }] }), 't_all', ['free[0]']);
  assert.ok(!m2.includes('z'.repeat(80)), `message keeps more than 80 characters of the value: ${m2.length} chars`);
  assert.ok(m1.length <= `Invalid argument "s" for t_all: `.length + 80 + 200, `message too long: ${m1.length}`);
});

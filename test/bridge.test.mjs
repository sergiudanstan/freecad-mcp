// Acceptance tests for src/freecad-bridge.ts (R5, R6; D1a, D2, D4), written before the implementation.
//
// CONTRACT (CONTRACT_BRIDGE) and the thresholds these tests use:
// - new FreeCADBridge(freecadCmd, timeout, { socketPort }); MAX_OUTPUT_BYTES = 10485760 (exported).
// - execute() calls are FIFO per instance (mode detection and process start included).
// - REPL script: <tmpdir()>/freecad-mcp-XXXXXX/ (mode 0700) / repl.py (mode 0600); dir removed by destroy();
//   never <tmpdir()>/freecad-mcp-repl.py.
// - Timeout: child SIGKILLed, error "FreeCAD execution timed out after <ms>ms; the headless FreeCAD session
//   was restarted and unsaved documents were lost"; next call runs on a fresh process.
// - Output cap: stdout of one call > MAX_OUTPUT_BYTES -> error containing "exceeds 10485760 bytes", process
//   reset, next call succeeds. Socket: data > cap -> socket destroyed, same error text, no headless fallback.
// - Socket request = "__MCP_AUTH__:<token>\n" + code + "\n__MCP_END__\n"; token read (trimmed) on every call
//   from join(os.homedir(), '.freecad-mcp', 'token'); missing token -> error containing "token not found",
//   no headless fallback. The token never appears in a returned error/result/output or in console.* output.
//
// Thresholds used here:
// - bridge timeout 1000 ms (timeout test), 1500 ms (other headless tests), 2000 ms (headless output cap),
//   2000 ms (socket tests).
// - slow call sleeps 2.5 s (> 1000 ms timeout); concurrent "first" call sleeps 0.3 s.
// - dead PID: polled every 50 ms, at most 2000 ms, until process.kill(pid, 0) throws ESRCH.
// - cold start: PID log read 300 ms after both calls settled; exactly 1 line.
// - output cap probe: 11 MiB printed (headless) / sent (socket).
// - removal of the private REPL dir after destroy(): polled every 50 ms, at most 1000 ms.
//
// Beyond the contract (fixed by these tests, read from the natural reading of the contract):
// - The fake socket server is detected by forcing bridge.checkSocket = async () => true (as headless tests
//   force false), so the tests do not depend on how the probe connection is made.
// - The fake server reads a request until "\n__MCP_END__\n", answers, then ends the connection; the bridge
//   is expected to take the reply as complete at end-of-stream (as the current macro does).
// - "No headless fallback" is checked as: the fake FreeCAD python was never started (its PID log is empty).
// - The private REPL dir is checked after the first successful call (it must exist while the process lives).
// - Fake FreeCAD: <X>/Contents/Resources/bin/python is a bash script that appends $$ to a log and execs
//   python3, so the logged PID is the REPL's PID.
//
// Added in iteration 2 (Meta-Agent intervention 2), thresholds:
// - spawn error: freecadCmd under a missing folder, headless, timeout 1000 ms; two successive calls, each must
//   resolve within a 3 s guard with success:false and a non-empty string error.
// - startup timeout: fake bin/python logs $$ then `exec sleep 30` (never prints __MCP_READY__), timeout 800 ms;
//   two successive calls, each resolved within timeout + 2 s with success:false and an error containing "timed out".
// - both startup tests: a rejection fails with "execute() must resolve, not reject: <message>"; no
//   'unhandledRejection' may fire during the test (checked ~100 ms after the last call).
// - serialization: own TCP server on a free port, replies 200 ms after a complete request with
//   {"success":true,"result":<code>,"output":""} and closes; in-flight count ++ on a complete request, -- right
//   before replying; bridge timeout 2000 ms; three simultaneous execute() calls; max in flight must be 1
//   ("max concurrent socket requests: <n>"); each caller gets its own code, requests arrive in call order.
// Beyond the contract (iteration 2):
// - "in call order": the queue is FIFO, so the server must receive the three codes in the order execute() was called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { FreeCADBridge } from '../dist/freecad-bridge.js';
import { dirname } from 'node:path';

const ROOT = fs.mkdtempSync(join(tmpdir(), 'bridge-test-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A private fake FreeCAD install plus private TMPDIR and HOME, set in process.env for the test's duration.
function makeEnv(name) {
  const base = fs.mkdtempSync(join(ROOT, `${name}-`));
  const app = join(base, 'X', 'Contents', 'Resources');
  fs.mkdirSync(join(app, 'bin'), { recursive: true });
  fs.mkdirSync(join(app, 'lib'), { recursive: true });
  const pidLog = join(base, 'pids.log');
  fs.writeFileSync(pidLog, '');
  fs.writeFileSync(join(app, 'bin', 'python'),
    `#!/bin/bash\necho $$ >> '${pidLog}'\nexec python3 "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(join(app, 'lib', 'FreeCAD.py'),
    'class Units:\n    class Quantity:\n        pass\n\n\nclass Vector:\n    pass\n');
  fs.writeFileSync(join(app, 'lib', 'Part.py'), '');
  const tmp = join(base, 'tmp');
  const home = join(base, 'home');
  fs.mkdirSync(tmp);
  fs.mkdirSync(home);
  const saved = { TMPDIR: process.env.TMPDIR, HOME: process.env.HOME };
  process.env.TMPDIR = tmp;
  process.env.HOME = home;
  const pids = () => fs.readFileSync(pidLog, 'utf8').split('\n').filter(Boolean).map(Number);
  return {
    cmd: join(app, 'bin', 'freecadcmd'),
    tmp,
    home,
    pids,
    cleanup() {
      for (const pid of pids()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    },
  };
}

function headless(env, timeout, opts) {
  const b = new FreeCADBridge(env.cmd, timeout, opts);
  b.checkSocket = async () => false;
  return b;
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
};

// Fake GUI macro: one request per connection, read until "\n__MCP_END__\n", reply by mode, then end.
// Modes, consumed per request: 'json' (default), 'garbage', 'close', 'big'.
async function fakeServer() {
  const requests = [];
  const modes = [];
  const sockets = new Set();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    let buf = '';
    let done = false;
    sock.on('data', (chunk) => {
      if (done) return;
      buf += chunk.toString();
      const end = buf.indexOf('\n__MCP_END__\n');
      if (end === -1) return;
      done = true;
      const nl = buf.indexOf('\n');
      requests.push({ raw: buf, firstLine: buf.slice(0, nl), code: buf.slice(nl + 1, end) });
      const mode = modes.shift() ?? 'json';
      if (mode === 'json') sock.end(JSON.stringify({ success: true, result: 'ok', output: '' }));
      else if (mode === 'garbage') sock.end('this is not json');
      else if (mode === 'close') sock.end();
      else if (mode === 'big') {
        const block = Buffer.alloc(1024 * 1024, 'x');
        for (let i = 0; i < 11 && !sock.destroyed; i++) sock.write(block);
        if (!sock.destroyed) sock.end();
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    requests,
    modes,
    close: () => new Promise((r) => {
      for (const s of sockets) s.destroy();
      server.close(() => r());
    }),
  };
}

test('bridge: single call works', async () => {
  const env = makeEnv('single');
  const b = headless(env, 1500);
  try {
    const r = await b.execute('_mcp_result["result"]="one"');
    assert.equal(r.success, true, `single call failed: ${JSON.stringify(r)}`);
    assert.equal(r.result, 'one');
  } finally {
    b.destroy();
    env.cleanup();
  }
});

test('bridge: fake socket server echoes', async () => {
  const srv = await fakeServer();
  try {
    const reply = await new Promise((resolve, reject) => {
      const c = net.connect(srv.port, '127.0.0.1', () => {
        c.write('__MCP_AUTH__:abc123\n_mcp_result["result"]=1\n__MCP_END__\n');
      });
      let data = '';
      c.on('data', (d) => { data += d; });
      c.on('end', () => resolve(data));
      c.on('error', reject);
    });
    assert.deepEqual(JSON.parse(reply), { success: true, result: 'ok', output: '' });
    assert.equal(srv.requests.length, 1);
    assert.equal(srv.requests[0].firstLine, '__MCP_AUTH__:abc123');
    assert.equal(srv.requests[0].code, '_mcp_result["result"]=1');
  } finally {
    await srv.close();
  }
});

test('bridge: concurrent calls', async () => {
  const env = makeEnv('concurrent');
  const b = headless(env, 1500);
  try {
    const warm = await b.execute('_mcp_result["result"]="warm"');
    assert.equal(warm.result, 'warm', `warm-up call failed: ${JSON.stringify(warm)}`);
    const r = await Promise.all([
      b.execute('import time; time.sleep(0.3); _mcp_result["result"]="first"'),
      b.execute('_mcp_result["result"]="second"'),
    ]);
    assert.deepEqual(r.map((x) => x.result ?? x.error), ['first', 'second'],
      'each concurrent caller must receive its own result');
  } finally {
    b.destroy();
    env.cleanup();
  }
});

test('bridge: timeout kills and restarts', async () => {
  const env = makeEnv('timeout');
  const b = headless(env, 1000);
  try {
    const slow = await b.execute('import time; time.sleep(2.5); _mcp_result["result"]="slow"');
    assert.equal(slow.success, false, `slow call must time out: ${JSON.stringify(slow)}`);
    assert.match(slow.error ?? '', /timed out after 1000ms/);
    assert.match(slow.error ?? '', /restarted/, `timeout error must say the session was restarted: ${slow.error}`);
    const [oldPid] = env.pids();
    assert.ok(oldPid, 'no REPL PID was logged');
    let dead = false;
    for (const t0 = Date.now(); Date.now() - t0 <= 2000; await sleep(50)) {
      if (!alive(oldPid)) { dead = true; break; }
    }
    assert.ok(dead, `old REPL process ${oldPid} still alive 2 s after the timeout`);
    const next = await b.execute('_mcp_result["result"]="next"');
    assert.equal(next.result, 'next', `call after timeout got another call's result: ${JSON.stringify(next)}`);
    const after = await b.execute('_mcp_result["result"]="after"');
    assert.equal(after.result, 'after');
  } finally {
    b.destroy();
    env.cleanup();
  }
});

test('bridge: cold start spawns one process', async () => {
  const env = makeEnv('cold');
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const b = headless(env, 1500);
  try {
    const settled = await Promise.allSettled([
      b.execute('_mcp_result["result"]="a"'),
      b.execute('_mcp_result["result"]="b"'),
    ]);
    await sleep(300);
    assert.equal(env.pids().length, 1, `cold start with 2 concurrent calls spawned ${env.pids().length} processes`);
    assert.deepEqual(settled.map((s) => s.status), ['fulfilled', 'fulfilled'], 'execute() must never reject');
    assert.deepEqual(settled.map((s) => s.value.result), ['a', 'b']);
    assert.equal(unhandled.length, 0, `unhandled rejections: ${unhandled.map(String).join('; ')}`);
  } finally {
    b.destroy();
    process.off('unhandledRejection', onUnhandled);
    env.cleanup();
  }
});

test('bridge: output cap', async () => {
  const env = makeEnv('cap');
  const b = headless(env, 2000);
  try {
    const big = await b.execute('print("x" * (11 * 1024 * 1024)); _mcp_result["result"]="big"');
    assert.equal(big.success, false, 'output over 10 MiB must fail (no output cap)');
    assert.match(big.error ?? '', /exceeds 10485760 bytes/);
    const next = await b.execute('_mcp_result["result"]="small"');
    assert.equal(next.result, 'small', `call after the cap must succeed: ${JSON.stringify(next).slice(0, 300)}`);
  } finally {
    b.destroy();
    env.cleanup();
  }
});

test('bridge: private repl dir', async () => {
  const env = makeEnv('repl');
  const b = headless(env, 1500);
  let destroyed = false;
  try {
    const r = await b.execute('_mcp_result["result"]="one"');
    assert.ok(!fs.existsSync(join(env.tmp, 'freecad-mcp-repl.py')),
      'REPL script written to the old shared path <tmpdir>/freecad-mcp-repl.py');
    assert.equal(r.result, 'one');
    const dirs = fs.readdirSync(env.tmp).filter((n) => n.startsWith('freecad-mcp-'));
    assert.equal(dirs.length, 1, `expected one private freecad-mcp-* dir, found: ${JSON.stringify(dirs)}`);
    const dir = join(env.tmp, dirs[0]);
    assert.ok(fs.statSync(dir).isDirectory());
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700, 'private dir mode must be 0700');
    const repl = join(dir, 'repl.py');
    assert.ok(fs.existsSync(repl), 'repl.py missing in the private dir');
    assert.equal(fs.statSync(repl).mode & 0o777, 0o600, 'repl.py mode must be 0600');
    b.destroy();
    destroyed = true;
    let gone = false;
    for (const t0 = Date.now(); Date.now() - t0 <= 1000; await sleep(50)) {
      if (!fs.existsSync(dir)) { gone = true; break; }
    }
    assert.ok(gone, 'private REPL dir still exists after destroy()');
  } finally {
    if (!destroyed) b.destroy();
    env.cleanup();
  }
});

test('bridge: socket sends token', async () => {
  const env = makeEnv('token');
  const srv = await fakeServer();
  const token = randomBytes(32).toString('hex');
  const tokenDir = join(env.home, '.freecad-mcp');
  fs.mkdirSync(tokenDir, { mode: 0o700 });
  fs.writeFileSync(join(tokenDir, 'token'), token + '\n', { mode: 0o600 });
  const logged = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logged.push(a.map(String).join(' ')); };
  const b = new FreeCADBridge(env.cmd, 2000, { socketPort: srv.port });
  b.checkSocket = async () => true;
  const results = [];
  try {
    const ok = await b.execute('_mcp_result["result"]="viaSocket"');
    results.push(ok);
    assert.ok(srv.requests.length >= 1,
      `fake server on socketPort ${srv.port} received no request (token not sent); bridge returned ${JSON.stringify(ok)}`);
    assert.equal(srv.requests[0].firstLine, `__MCP_AUTH__:${token}`, 'first line must be the auth line');
    assert.equal(srv.requests[0].code, '_mcp_result["result"]="viaSocket"');
    assert.equal(ok.success, true, `socket call failed: ${JSON.stringify(ok)}`);
    assert.equal(ok.result, 'ok');

    srv.modes.push('garbage');
    const garbage = await b.execute('_mcp_result["result"]="g"');
    results.push(garbage);
    assert.equal(garbage.success, false, 'non-JSON reply must give success:false');

    srv.modes.push('close');
    const closed = await b.execute('_mcp_result["result"]="c"');
    results.push(closed);
    assert.equal(closed.success, false, 'connection closed without reply must give success:false');

    fs.rmSync(join(tokenDir, 'token'));
    const missing = await b.execute('_mcp_result["result"]="m"');
    results.push(missing);
    assert.equal(missing.success, false);
    assert.match(missing.error ?? '', /token not found/);
    assert.equal(env.pids().length, 0, 'bridge fell back to headless');

    for (const r of results) {
      for (const k of ['error', 'result', 'output']) {
        assert.ok(!JSON.stringify(r[k] ?? '').includes(token), `token leaked in returned ${k}`);
      }
    }
    assert.ok(!logged.some((l) => l.includes(token)), 'token leaked in console output');
  } finally {
    Object.assign(console, orig);
    b.destroy();
    await srv.close();
    env.cleanup();
  }
});

test('bridge: socket output cap', async () => {
  const env = makeEnv('sockcap');
  const srv = await fakeServer();
  const tokenDir = join(env.home, '.freecad-mcp');
  fs.mkdirSync(tokenDir, { mode: 0o700 });
  fs.writeFileSync(join(tokenDir, 'token'), randomBytes(32).toString('hex'), { mode: 0o600 });
  const b = new FreeCADBridge(env.cmd, 2000, { socketPort: srv.port });
  b.checkSocket = async () => true;
  try {
    srv.modes.push('big');
    const big = await b.execute('_mcp_result["result"]="big"');
    assert.equal(big.success, false, `socket reply over 10 MiB must fail (no output cap): ${JSON.stringify(big).slice(0, 300)}`);
    assert.match(big.error ?? '', /exceeds 10485760 bytes/);
    assert.equal(env.pids().length, 0, 'output cap on socket must not fall back to headless');
    const next = await b.execute('_mcp_result["result"]="next"');
    assert.equal(next.success, true, `call after the socket cap must succeed: ${JSON.stringify(next).slice(0, 300)}`);
    assert.equal(next.result, 'ok');
  } finally {
    b.destroy();
    await srv.close();
    env.cleanup();
  }
});

// Settles p within ms: { status: 'fulfilled', value } | { status: 'rejected', reason } | { status: 'hung' }.
async function settleWithin(p, ms) {
  let timer;
  const guard = new Promise((r) => { timer = setTimeout(() => r({ status: 'hung' }), ms); });
  try {
    return await Promise.race([
      p.then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason })),
      guard,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function assertResolvedFailure(s, label) {
  if (s.status === 'rejected') {
    assert.fail(`execute() must resolve, not reject: ${s.reason?.message ?? String(s.reason)}`);
  }
  assert.notEqual(s.status, 'hung', `${label}: execute() neither resolved nor rejected in time`);
  assert.equal(s.value.success, false, `${label}: must give success:false: ${JSON.stringify(s.value)}`);
  assert.equal(typeof s.value.error, 'string', `${label}: error must be a string: ${JSON.stringify(s.value)}`);
  assert.ok(s.value.error.length > 0, `${label}: error must be non-empty`);
}

test('bridge: spawn error is a result', async () => {
  const env = makeEnv('spawnerr');
  const missing = fs.mkdtempSync(join(ROOT, 'spawnerr-missing-'));
  const cmd = join(missing, 'missing', 'Contents', 'Resources', 'bin', 'freecadcmd');
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const b = new FreeCADBridge(cmd, 1000);
  b.checkSocket = async () => false;
  try {
    for (const label of ['first call', 'second call']) {
      const s = await settleWithin(b.execute('_mcp_result["result"]="x"'), 3000);
      assertResolvedFailure(s, label);
    }
    await sleep(100);
    assert.equal(unhandled.length, 0, `unhandled rejections: ${unhandled.map(String).join('; ')}`);
  } finally {
    b.destroy();
    process.off('unhandledRejection', onUnhandled);
    env.cleanup();
  }
});

test('bridge: startup timeout is a result', async () => {
  const env = makeEnv('startto');
  const bin = dirname(env.cmd);
  const pidLog = join(dirname(dirname(dirname(dirname(bin)))), 'pids.log');
  fs.writeFileSync(join(bin, 'python'), `#!/bin/bash\necho $$ >> '${pidLog}'\nexec sleep 30\n`, { mode: 0o755 });
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const timeout = 800;
  const b = headless(env, timeout);
  try {
    for (const label of ['first call', 'second call']) {
      const s = await settleWithin(b.execute('_mcp_result["result"]="x"'), timeout + 2000);
      assertResolvedFailure(s, label);
      assert.match(s.value.error, /timed out/, `${label}: error must say it timed out: ${s.value.error}`);
    }
    await sleep(100);
    assert.equal(unhandled.length, 0, `unhandled rejections: ${unhandled.map(String).join('; ')}`);
  } finally {
    b.destroy();
    process.off('unhandledRejection', onUnhandled);
    env.cleanup();
  }
});

// Fake GUI macro that counts requests in flight: ++ on a complete request, -- right before the reply sent
// 200 ms later; the reply echoes the code (text after the first line, up to the end marker), then closes.
async function countingServer() {
  const state = { inFlight: 0, max: 0, codes: [] };
  const sockets = new Set();
  const timers = new Set();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    let buf = '';
    let done = false;
    sock.on('data', (chunk) => {
      if (done) return;
      buf += chunk.toString();
      const end = buf.indexOf('\n__MCP_END__\n');
      if (end === -1) return;
      done = true;
      const code = buf.slice(buf.indexOf('\n') + 1, end);
      state.codes.push(code);
      state.inFlight++;
      state.max = Math.max(state.max, state.inFlight);
      const t = setTimeout(() => {
        timers.delete(t);
        state.inFlight--;
        if (!sock.destroyed) sock.end(JSON.stringify({ success: true, result: code, output: '' }));
      }, 200);
      timers.add(t);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    state,
    close: () => new Promise((r) => {
      for (const t of timers) clearTimeout(t);
      for (const s of sockets) s.destroy();
      server.close(() => r());
    }),
  };
}

test('bridge: socket calls are serialized', async () => {
  const env = makeEnv('serial');
  const srv = await countingServer();
  const tokenDir = join(env.home, '.freecad-mcp');
  fs.mkdirSync(tokenDir, { mode: 0o700 });
  fs.writeFileSync(join(tokenDir, 'token'), randomBytes(32).toString('hex'), { mode: 0o600 });
  const b = new FreeCADBridge(env.cmd, 2000, { socketPort: srv.port });
  b.checkSocket = async () => true;
  try {
    const codes = ['_mcp_result["result"]="s1"', '_mcp_result["result"]="s2"', '_mcp_result["result"]="s3"'];
    const settled = await Promise.allSettled(codes.map((c) => b.execute(c)));
    assert.equal(srv.state.max, 1, `max concurrent socket requests: ${srv.state.max}`);
    assert.deepEqual(settled.map((x) => x.status === 'fulfilled' ? (x.value.result ?? x.value.error) : `rejected: ${x.reason?.message}`),
      codes, 'each caller must receive its own result');
    assert.deepEqual(srv.state.codes, codes, 'requests must reach the server in call order');
  } finally {
    b.destroy();
    await srv.close();
    env.cleanup();
  }
});

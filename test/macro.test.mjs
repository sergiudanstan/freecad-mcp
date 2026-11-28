// Acceptance tests for freecad_server.FCMacro (decision D1b: token authentication).
// FreeCAD is not installed: the macro runs under python3 against fake FreeCAD, FreeCADGui,
// Part and PySide6.QtCore modules written to a temporary folder.
//
// CONTRACT_MACRO (what these tests hold the macro to):
// - On start: ~/.freecad-mcp created with mode 0700; token = secrets.token_hex(32) (64 lowercase hex),
//   written to ~/.freecad-mcp/token with mode 0600, new on every start.
// - A request is read up to "\n__MCP_END__\n". More than 10485760 bytes received ->
//   {"success": false, "error": "Request exceeds 10485760 bytes"}, connection closed, nothing executed.
// - The first line must be "__MCP_AUTH__:<token>", compared with hmac.compare_digest; missing or wrong ->
//   {"success": false, "error": "Unauthorized"}, connection closed, nothing executed.
// - The code is the rest after the first line; the response is the JSON of _mcp_result, as today.
// - Bound to 127.0.0.1; the line `MCP_PORT = 12345` stays literal (the harness replaces it textually).
//
// Thresholds and choices fixed by these tests:
// - Port wait: up to 10 s, probing every 50 ms; a probe is an empty request (connect, half-close) and
//   counts once the server has closed it (at most 5 s per probe).
// - Token file wait after the port opens: up to 2 s.
// - Per-request response timeout: 20 s.
// - "Nothing executed" is observed through a sentinel file the request code would create; it is
//   checked 300 ms after the response (the queue poll runs every 50 ms).
// - Token file content: exactly 64 lowercase hex chars; a single trailing newline is tolerated.
// - Oversized request: 11 MiB of code behind a valid token (no auth line at all if the token file is
//   missing, so the macro of today fails on the sentinel, not on a syntax error); the client tolerates
//   the server closing the socket early (EPIPE/ECONNRESET) as long as the response JSON arrives.
//   The error string must equal "Request exceeds 10485760 bytes".
// - Size boundary: a request of exactly 10485760 bytes in total (auth line + code + "\n__MCP_END__\n")
//   is not "over" the limit and must run (success true, result 7). This catches a cap set too low.
// - Wrong token: 64 '0' characters (or 64 '1' if the real token happens to be all zeros).
// Beyond the contract text:
// - the response for missing/wrong token must also have success === false;
// - the size error is tested with a valid token, so its order relative to the auth check is free;
// - the bytes counted against the limit are the whole request as sent (auth line and end marker
//   included); an implementation that counts fewer bytes still passes the boundary request;
// - a token file left with mode 0644 by an earlier run must be back at 0600 after the next start
//   (os.open(..., O_CREAT, 0o600) alone does not change the mode of an existing file);
// - the code is executed exactly as the rest after the auth line: its 2nd line reports f_lineno 2
//   (an implementation that also executes the auth line, which is a valid Python annotation when the
//   token starts with a letter, or that wraps the code, fails "runs with valid token");
// - the sentinel code repeats the open() on its first two lines (see sentinelCode);
// - not tested: the 127.0.0.1 bind and the mode of a pre-existing ~/.freecad-mcp directory.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MACRO = path.join(ROOT, 'freecad_server.FCMacro');
const PORT_LINE = 'MCP_PORT = 12345';
const MAX_BYTES = 10485760;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = new Set();
const tmpDirs = [];

function killAll() {
  for (const p of procs) {
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }
  procs.clear();
}
process.on('exit', killAll);
after(() => {
  killAll();
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

const FAKES = {
  'FreeCAD.py': `import sys
class Console:
    @staticmethod
    def PrintMessage(msg):
        sys.stderr.write(str(msg)); sys.stderr.flush()
    @staticmethod
    def PrintError(msg):
        sys.stderr.write(str(msg)); sys.stderr.flush()
    @staticmethod
    def PrintWarning(msg):
        sys.stderr.write(str(msg)); sys.stderr.flush()
class Units:
    class Quantity:
        def __init__(self, value=0.0, unit=''):
            self.Value = value
            self.Unit = unit
class Vector:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = x, y, z
`,
  'FreeCADGui.py': '',
  'Part.py': '',
  'PySide6/__init__.py': '',
  'PySide6/QtCore.py': `import threading, time
class _Signal:
    def __init__(self):
        self._fns = []
    def connect(self, fn):
        self._fns.append(fn)
class QTimer:
    def __init__(self, *args):
        self.timeout = _Signal()
    def start(self, ms=0):
        def run():
            while True:
                for fn in list(self.timeout._fns):
                    fn()
                time.sleep(ms / 1000.0)
        threading.Thread(target=run, daemon=True).start()
`,
};

function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

function writeFakes() {
  const dir = mkTmp('fcmcp-fakes-');
  for (const [rel, body] of Object.entries(FAKES)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// A probe is a full round trip: connect, send nothing, half-close, and wait until the server closes
// the connection. The macro serves one connection at a time from a listen(1) socket; a request sent
// while the probe is still queued can be reset, so the next request is made only after the probe is done.
function canConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    let connected = false;
    const timer = setTimeout(() => { s.destroy(); resolve(connected); }, 5000);
    s.once('connect', () => { connected = true; s.end(); });
    s.on('data', () => {});
    s.once('error', () => {});
    s.once('close', () => { clearTimeout(timer); resolve(connected); });
  });
}

// Starts the macro under python3 with fake FreeCAD modules; resolves once the port accepts connections.
// `lines` replaces whole literal lines of the macro (e.g. a shorter timeout), like the port line.
async function startMacro(home = mkTmp('fcmcp-home-'), lines = {}) {
  let src = fs.readFileSync(MACRO, 'utf8');
  assert.ok(src.includes(PORT_LINE), `harness: macro has no literal line "${PORT_LINE}"`);
  for (const [from, to] of Object.entries(lines)) {
    assert.ok(src.includes(from), `harness: macro has no literal line "${from}"`);
    src = src.replace(from, to);
  }
  const port = await freePort();
  const fakes = writeFakes();
  const patched = path.join(mkTmp('fcmcp-src-'), 'macro.py');
  fs.writeFileSync(patched, src.replace(PORT_LINE, `MCP_PORT = ${port}`));
  const script = [
    'import sys, time',
    `sys.path.insert(0, ${JSON.stringify(fakes)})`,
    `_src = open(${JSON.stringify(patched)}, encoding="utf-8").read()`,
    'exec(compile(_src, "freecad_server.FCMacro", "exec"), {"__name__": "__main__"})',
    'while True:',
    '    time.sleep(1)',
  ].join('\n');
  const child = spawn('python3', ['-c', script], {
    env: { ...process.env, HOME: home, PYTHONDONTWRITEBYTECODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.add(child);
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  let exited = null;
  child.once('exit', (code, sig) => { exited = `${code ?? sig}`; procs.delete(child); });

  const deadline = Date.now() + 10000;
  while (!(await canConnect(port))) {
    if (exited !== null) assert.fail(`harness: python exited (${exited}) before opening the port:\n${log}`);
    if (Date.now() > deadline) assert.fail(`harness: port ${port} not open after 10 s:\n${log}`);
    await sleep(50);
  }
  const stop = () => { try { child.kill('SIGKILL'); } catch { /* gone */ } procs.delete(child); };
  return { port, home, child, stop, log: () => log };
}

const tokenDir = (home) => path.join(home, '.freecad-mcp');
const tokenFile = (home) => path.join(tokenDir(home), 'token');

async function readToken(home, { required = true } = {}) {
  const f = tokenFile(home);
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(f) && Date.now() < deadline) await sleep(50);
  if (!fs.existsSync(f)) {
    if (required) assert.fail(`token file ${f} is missing after the server started`);
    return null;
  }
  return fs.readFileSync(f, 'utf8').replace(/\n$/, '');
}

// Sends one request and resolves with the raw response text once the server closes the connection.
function request(port, payload) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    let buf = '';
    const timer = setTimeout(() => { s.destroy(); reject(new Error('no response within 20 s')); }, 20000);
    s.on('data', (d) => { buf += d; });
    s.on('error', (e) => {
      // The server may close while we are still writing (oversized request); keep what arrived.
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') return;
      clearTimeout(timer); reject(e);
    });
    s.on('close', () => { clearTimeout(timer); resolve(buf); });
    s.on('connect', () => s.write(payload));
  });
}

function parse(raw) {
  try { return JSON.parse(raw); } catch { assert.fail(`response is not JSON: ${JSON.stringify(raw.slice(0, 300))}`); }
}

const pyStr = (s) => JSON.stringify(s);
// The sentinel is created on the first two lines, so an implementation that drops the first line
// (taking it for the auth line) and runs the rest still creates it.
const sentinelCode = (sentinel) =>
  `open(${pyStr(sentinel)}, "w").close()\nopen(${pyStr(sentinel)}, "w").close()\n_mcp_result["result"] = 1`;
const frame = (firstLine, code) => (firstLine === null ? '' : `${firstLine}\n`) + `${code}\n__MCP_END__\n`;

async function assertNotExecuted(sentinel) {
  await sleep(300);
  assert.equal(fs.existsSync(sentinel), false, 'sentinel file was created: the request code was executed');
}

test('macro: harness loads (control: the port opens on the macro as it is)', async () => {
  const m = await startMacro();
  try {
    assert.equal(m.child.exitCode, null);
  } finally { m.stop(); }
});

test('macro: token file permissions', async () => {
  const home = mkTmp('fcmcp-home-');
  const m1 = await startMacro(home);
  let first;
  try {
    first = await readToken(home);
    const dirMode = fs.statSync(tokenDir(home)).mode & 0o777;
    const fileMode = fs.statSync(tokenFile(home)).mode & 0o777;
    assert.equal(dirMode.toString(8), '700', '~/.freecad-mcp must have mode 0700');
    assert.equal(fileMode.toString(8), '600', '~/.freecad-mcp/token must have mode 0600');
    assert.match(first, /^[0-9a-f]{64}$/, 'token must be secrets.token_hex(32)');
  } finally { m1.stop(); }
  fs.chmodSync(tokenFile(home), 0o644); // as left by an older or careless run
  const m2 = await startMacro(home);
  try {
    const deadline = Date.now() + 2000;
    let second = await readToken(home);
    while (second === first && Date.now() < deadline) { await sleep(50); second = await readToken(home); }
    assert.match(second, /^[0-9a-f]{64}$/);
    assert.notEqual(second, first, 'a new token must be generated on every start');
    const fileMode2 = fs.statSync(tokenFile(home)).mode & 0o777;
    assert.equal(fileMode2.toString(8), '600', 'an existing token file must be rewritten with mode 0600');
  } finally { m2.stop(); }
});

test('macro: rejects missing token', async () => {
  const m = await startMacro();
  try {
    const sentinel = path.join(m.home, 'sentinel-missing');
    const res = parse(await request(m.port, frame(null, sentinelCode(sentinel))));
    await assertNotExecuted(sentinel);
    assert.equal(res.success, false);
    assert.equal(res.error, 'Unauthorized');
  } finally { m.stop(); }
});

test('macro: rejects wrong token', async () => {
  const m = await startMacro();
  try {
    const real = await readToken(m.home, { required: false });
    const wrong = real === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
    const sentinel = path.join(m.home, 'sentinel-wrong');
    const res = parse(await request(m.port, frame(`__MCP_AUTH__:${wrong}`, sentinelCode(sentinel))));
    await assertNotExecuted(sentinel);
    assert.equal(res.success, false);
    assert.equal(res.error, 'Unauthorized');
  } finally { m.stop(); }
});

test('macro: runs with valid token', async () => {
  const m = await startMacro();
  try {
    const token = await readToken(m.home);
    const code = '_mcp_result["result"] = 42\n_mcp_result["line"] = __import__("sys")._getframe().f_lineno';
    const res = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, code)));
    assert.equal(res.success, true, `unexpected response: ${JSON.stringify(res)}`);
    assert.equal(res.result, 42);
    assert.equal(res.line, 2, 'the code must be exactly the rest after the auth line (its 2nd line is line 2)');
  } finally { m.stop(); }
});

test('macro: rejects oversized request', async () => {
  const m = await startMacro();
  try {
    const token = await readToken(m.home, { required: false });
    const auth = token === null ? null : `__MCP_AUTH__:${token}`;
    const sentinel = path.join(m.home, 'sentinel-oversized');
    const code = `${sentinelCode(sentinel)}\n#${'x'.repeat(11 * 1024 * 1024)}`;
    const res = parse(await request(m.port, frame(auth, code)));
    await assertNotExecuted(sentinel);
    assert.equal(res.success, false);
    assert.equal(res.error, `Request exceeds ${MAX_BYTES} bytes`);

    // Exactly at the limit is not over it: the request must run.
    const head = frame(auth, '_mcp_result["result"] = 7\n#');
    const fill = MAX_BYTES - Buffer.byteLength(head);
    const atLimit = frame(auth, `_mcp_result["result"] = 7\n#${'x'.repeat(fill)}`);
    assert.equal(Buffer.byteLength(atLimit), MAX_BYTES, 'harness: boundary request has the wrong size');
    const ok = parse(await request(m.port, atLimit));
    assert.equal(ok.success, true, `a request of exactly ${MAX_BYTES} bytes was refused: ${JSON.stringify(ok).slice(0, 200)}`);
    assert.equal(ok.result, 7);
  } finally { m.stop(); }
});

// Clause D13 (NIS2, security event logging): every request that carried data and was refused with
// "Unauthorized" leaves exactly one FreeCAD.Console.PrintWarning("MCP Server: rejected unauthorized request\n");
// an empty connection (the bridge's checkSocket, the harness probes) leaves none; the console never shows
// the real or the supplied token; a valid request adds no warning. The fake Console writes to stderr,
// which m.log() collects. Waits: 300 ms after the empty connection and after the valid request, up to 2 s
// for the two warnings to appear.
test('macro: logs rejected requests', async () => {
  const m = await startMacro();
  try {
    const WARNING = 'rejected unauthorized request';
    const count = () => m.log().split(WARNING).length - 1;
    const token = await readToken(m.home);

    // (a) an empty connection, like checkSocket(): connect, then close without sending anything
    await new Promise((resolve) => {
      const s = net.connect({ port: m.port, host: '127.0.0.1' });
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => resolve());
    });
    await sleep(300);
    assert.equal(count(), 0, `warnings for empty connections: ${count()}`);

    // (b) one request without the auth line and one with a wrong token
    const wrong = token === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
    const r1 = parse(await request(m.port, frame(null, '_mcp_result["result"] = 1')));
    const r2 = parse(await request(m.port, frame(`__MCP_AUTH__:${wrong}`, '_mcp_result["result"] = 1')));
    assert.equal(r1.error, 'Unauthorized');
    assert.equal(r2.error, 'Unauthorized');
    const deadline = Date.now() + 2000;
    while (count() < 2 && Date.now() < deadline) await sleep(50);
    assert.equal(count(), 2, `rejected-request warnings: ${count()}`);

    // (c) no token in the console output
    const log = m.log();
    assert.ok(!log.includes(token) && !log.includes(wrong), 'the console output contains a token');

    // (d) a valid request succeeds and adds no warning
    const ok = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, '_mcp_result["result"] = 5')));
    assert.equal(ok.success, true, `unexpected response: ${JSON.stringify(ok)}`);
    await sleep(300);
    assert.equal(count(), 2, `warnings after a valid request: ${count()}`);
  } finally { m.stop(); }
});

// A client that connects and stays silent must not block the macro (it serves one connection at a
// time): with the idle timeout set to 1 s, a valid request sent behind it is answered within 6 s.
test('macro: a silent client does not block other requests', async () => {
  const m = await startMacro(undefined, { 'MCP_CLIENT_IDLE_TIMEOUT = 10': 'MCP_CLIENT_IDLE_TIMEOUT = 1' });
  const silent = net.connect({ port: m.port, host: '127.0.0.1' });
  silent.on('error', () => {});
  try {
    const token = await readToken(m.home);
    await new Promise((resolve) => silent.once('connect', resolve));
    const started = Date.now();
    const res = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, '_mcp_result["result"] = 3')));
    assert.equal(res.success, true, `unexpected response: ${JSON.stringify(res)}`);
    assert.equal(res.result, 3);
    assert.ok(Date.now() - started < 6000, `answered after ${Date.now() - started} ms`);
  } finally { silent.destroy(); m.stop(); }
});

// A request whose caller has timed out before FreeCAD started it must never run. With the execution
// timeout at 1 s: request A keeps the main thread busy for 3 s (it times out while running), request B
// is queued behind it, times out before it starts, and must not create its sentinel afterwards.
test('macro: a request that timed out before it started is never run', async () => {
  const m = await startMacro(undefined, { 'MCP_EXEC_TIMEOUT = 30': 'MCP_EXEC_TIMEOUT = 1' });
  try {
    const token = await readToken(m.home);
    const a = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, 'import time\ntime.sleep(3)\n_mcp_result["result"] = "a"')));
    assert.equal(a.success, false);
    assert.match(a.error, /still running/, `request A: ${JSON.stringify(a)}`);
    const sentinel = path.join(m.home, 'sentinel-expired');
    const b = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, sentinelCode(sentinel))));
    assert.equal(b.success, false);
    assert.match(b.error, /not run/, `request B: ${JSON.stringify(b)}`);
    await sleep(3000); // A finishes; the main thread then reaches B in the queue
    assert.equal(fs.existsSync(sentinel), false, 'the expired request was run after its caller gave up');
    const c = parse(await request(m.port, frame(`__MCP_AUTH__:${token}`, '_mcp_result["result"] = "c"')));
    assert.equal(c.result, 'c', `request C after the expired ones: ${JSON.stringify(c)}`);
  } finally { m.stop(); }
});

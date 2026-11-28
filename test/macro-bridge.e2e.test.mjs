// End-to-end tests of the bridge <-> macro interface (token authentication, decision D1b).
// FreeCAD is not installed: the macro runs under python3 against fake FreeCAD, FreeCADGui, Part and
// PySide6.QtCore modules (same harness technique as test/macro.test.mjs), on a free port, and a
// FreeCADBridge from dist/ talks to it. Macro and bridge share one temporary HOME, so the token file
// the macro writes (~/.freecad-mcp/token) is the one the bridge reads.

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
const { FreeCADBridge } = await import(path.join(ROOT, 'dist', 'freecad-bridge.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = new Set();
const tmpDirs = [];
const ORIGINAL_HOME = process.env.HOME;

function killAll() {
  for (const p of procs) {
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }
  procs.clear();
}
process.on('exit', killAll);
after(() => {
  killAll();
  process.env.HOME = ORIGINAL_HOME;
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

// Full round trip (connect, half-close, wait for the server to close): the macro serves one
// connection at a time, so the next request is made only after the probe is done.
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

// Starts the macro with HOME = home; resolves once the port accepts connections and the token file exists.
async function startMacro(home) {
  const src = fs.readFileSync(MACRO, 'utf8');
  assert.ok(src.includes(PORT_LINE), `harness: macro has no literal line "${PORT_LINE}"`);
  const port = await freePort();
  const fakes = mkTmp('fcmcp-fakes-');
  for (const [rel, body] of Object.entries(FAKES)) {
    const f = path.join(fakes, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
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
  const token = tokenFile(home);
  const tokenDeadline = Date.now() + 2000;
  while (!fs.existsSync(token) && Date.now() < tokenDeadline) await sleep(50);
  assert.ok(fs.existsSync(token), `harness: macro did not write ${token}:\n${log}`);
  const stop = () => { try { child.kill('SIGKILL'); } catch { /* gone */ } procs.delete(child); };
  return { port, stop };
}

const tokenFile = (home) => path.join(home, '.freecad-mcp', 'token');

// Macro and bridge share HOME: the bridge resolves ~/.freecad-mcp/token through os.homedir().
async function setup() {
  const home = mkTmp('fcmcp-home-');
  process.env.HOME = home;
  const macro = await startMacro(home);
  const bridge = new FreeCADBridge(undefined, 10000, { socketPort: macro.port });
  const stop = () => { bridge.destroy(); macro.stop(); };
  return { home, bridge, stop };
}

test('e2e: bridge talks to macro with token', async () => {
  const { home, bridge, stop } = await setup();
  try {
    const ok = await bridge.execute('_mcp_result["result"] = 7');
    assert.equal(ok.success, true, `unexpected response: ${JSON.stringify(ok)}`);
    assert.equal(ok.result, 7);

    fs.rmSync(tokenFile(home));
    const missing = await bridge.execute('_mcp_result["result"] = 8');
    assert.equal(missing.success, false);
    assert.match(String(missing.error), /token not found/);
  } finally { stop(); }
});

test('e2e: wrong token is rejected', async () => {
  const { home, bridge, stop } = await setup();
  try {
    const real = fs.readFileSync(tokenFile(home), 'utf8').trim();
    const wrong = real === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
    fs.writeFileSync(tokenFile(home), wrong);
    const sentinel = path.join(home, 'sentinel-wrong-token');
    const code = `open(${JSON.stringify(sentinel)}, "w").close()\n_mcp_result["result"] = 1`;
    const res = await bridge.execute(code);
    assert.equal(res.success, false);
    assert.match(String(res.error), /Unauthorized/);
    await sleep(300);
    assert.equal(fs.existsSync(sentinel), false, 'sentinel file was created: code ran with a wrong token');
  } finally { stop(); }
});

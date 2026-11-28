import { spawn, ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import * as net from 'node:net';
import { FreeCADResult } from './types.js';

const DEFAULT_FREECAD_APP = '/Applications/FreeCAD.app/Contents/Resources';
const RESULT_MARKER = '__MCP_RESULT__';
const DEFAULT_SOCKET_PORT = 12345;
const SOCKET_HOST = '127.0.0.1';

/** Upper bound on the output of one call (headless stdout or socket reply). */
export const MAX_OUTPUT_BYTES = 10485760;

export interface FreeCADBridgeOptions {
  socketPort?: number;
}

/** The token path is printed; the token itself never leaves readToken(). */
function tokenPath(): string {
  return join(homedir(), '.freecad-mcp', 'token');
}

/**
 * Persistent FreeCAD bridge.
 * Supports two modes:
 *   - Socket mode: connects to a running FreeCAD GUI with the MCP server macro
 *   - Headless mode: spawns a freecadcmd Python REPL (fallback)
 *
 * Calls to execute() run one at a time per instance, in call order (FIFO).
 */
export class FreeCADBridge {
  private freecadApp: string;
  private timeout: number;
  private socketPort: number;
  private process: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private stdoutBuffer = '';
  private stdoutBytes = 0;
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;
  private pendingMarker = '';
  private replDir: string | null = null;
  private replScriptPath: Promise<string> | null = null;
  private useSocket: boolean | null = null; // null = auto-detect
  private queue: Promise<unknown> = Promise.resolve();

  constructor(freecadCmd?: string, timeout: number = 30000, options?: FreeCADBridgeOptions) {
    const cmd = freecadCmd || process.env.FREECAD_CMD || `${DEFAULT_FREECAD_APP}/bin/freecadcmd`;
    const match = cmd.match(/^(.+\/Contents\/Resources)/);
    this.freecadApp = match ? match[1] : DEFAULT_FREECAD_APP;
    this.timeout = timeout;
    this.socketPort = options?.socketPort ?? DEFAULT_SOCKET_PORT;
  }

  private async checkSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(1000);
      client.connect(this.socketPort, SOCKET_HOST, () => {
        client.destroy();
        resolve(true);
      });
      client.on('error', () => {
        client.destroy();
        resolve(false);
      });
      client.on('timeout', () => {
        client.destroy();
        resolve(false);
      });
    });
  }

  private async readToken(): Promise<string | null> {
    try {
      const token = (await readFile(tokenPath(), 'utf-8')).trim();
      return token || null;
    } catch {
      return null;
    }
  }

  private async executeSocket(pythonCode: string): Promise<FreeCADResult> {
    const token = await this.readToken();
    if (!token) {
      return {
        success: false,
        error: `FreeCAD GUI token not found at ${tokenPath()}; restart freecad_server.FCMacro (1.3.0 or later)`,
      };
    }

    return new Promise((resolve) => {
      const client = new net.Socket();
      const chunks: Buffer[] = [];
      let bytes = 0;
      let resolved = false;

      const finish = (result: FreeCADResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        client.destroy();
        finish({ success: false, error: `Socket execution timed out after ${this.timeout}ms` });
      }, this.timeout);

      client.connect(this.socketPort, SOCKET_HOST, () => {
        client.write(`__MCP_AUTH__:${token}\n` + pythonCode + '\n__MCP_END__\n');
      });

      client.on('data', (chunk: Buffer) => {
        if (resolved) return;
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) {
          chunks.length = 0;
          client.destroy();
          finish({ success: false, error: `FreeCAD GUI reply exceeds ${MAX_OUTPUT_BYTES} bytes; connection closed` });
          return;
        }
        chunks.push(chunk);
      });

      client.on('end', () => {
        try {
          finish(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as FreeCADResult);
        } catch {
          finish({ success: false, error: 'Failed to parse response from FreeCAD GUI' });
        }
      });

      client.on('error', (err) => {
        finish({ success: false, error: `Socket error: ${err.message}` });
      });
    });
  }

  // --- Headless mode ---

  /** Writes the REPL script once per instance into a private 0700 folder (exclusive create, 0600). */
  private writeReplScript(replScript: string): Promise<string> {
    if (!this.replScriptPath) {
      this.replScriptPath = (async () => {
        const dir = await mkdtemp(join(tmpdir(), 'freecad-mcp-'));
        this.replDir = dir;
        const path = join(dir, 'repl.py');
        await writeFile(path, replScript, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
        return path;
      })();
      this.replScriptPath.catch(() => { this.replScriptPath = null; });
    }
    return this.replScriptPath;
  }

  /** Kills the REPL (if any) and clears all per-process state; the next call starts a fresh process. */
  private resetProcess(): void {
    const proc = this.process;
    this.process = null;
    this.ready = null;
    this.stdoutBuffer = '';
    this.stdoutBytes = 0;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.pendingMarker = '';
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  private rejectPending(err: Error): void {
    const reject = this.pendingReject;
    this.pendingResolve = null;
    this.pendingReject = null;
    reject?.(err);
  }

  private async ensureProcess(): Promise<void> {
    if (this.ready && this.process && this.process.exitCode === null) {
      return this.ready;
    }
    this.resetProcess();

    const replScript = `
import sys
import json
import FreeCAD
import Part

MARKER = "${RESULT_MARKER}"


def _mcp_json(value):
    # json.dumps cannot encode FreeCAD types. Quantities (Length, Angle, ...) become
    # their number in internal units, vectors a list, anything else its repr.
    if isinstance(value, FreeCAD.Units.Quantity):
        return value.Value
    if isinstance(value, FreeCAD.Vector):
        return [value.x, value.y, value.z]
    return repr(value)


def _mcp_encode(result):
    try:
        return json.dumps(result, default=_mcp_json)
    except ValueError as err:  # e.g. a circular reference
        return json.dumps({"success": False, "error": "Result could not be encoded: " + str(err)})


print("__MCP_READY__", flush=True)

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line.startswith("__MCP_EXEC__"):
            continue

        count = int(line.split(":")[1])
        code_lines = []
        for _ in range(count):
            code_lines.append(sys.stdin.readline().rstrip("\\n"))
        code = "\\n".join(code_lines)

        _mcp_result = {"success": True}
        _mcp_globals = dict(globals())
        _mcp_globals["_mcp_result"] = _mcp_result
        try:
            exec(code, _mcp_globals)
            _mcp_result = _mcp_globals["_mcp_result"]
        except Exception as e:
            _mcp_result = {"success": False, "error": str(e)}

        print(MARKER, flush=True)
        print(_mcp_encode(_mcp_result), flush=True)
        print(MARKER + "END", flush=True)
    except Exception as e:
        print(MARKER, flush=True)
        print(json.dumps({"success": False, "error": "REPL error: " + str(e)}), flush=True)
        print(MARKER + "END", flush=True)
`;

    const scriptPath = await this.writeReplScript(replScript);

    const pythonBin = `${this.freecadApp}/bin/python`;
    const libPath = `${this.freecadApp}/lib`;

    const proc = spawn(pythonBin, ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: libPath,
        PYTHONUNBUFFERED: '1',
      },
    });
    this.process = proc;
    this.stdoutBuffer = '';
    this.stdoutBytes = 0;

    proc.stdout!.on('data', (chunk: Buffer) => {
      if (this.process !== proc) return;
      this.stdoutBytes += chunk.length;
      if (this.stdoutBytes > MAX_OUTPUT_BYTES) {
        const reject = this.pendingReject;
        this.resetProcess();
        reject?.(new Error(`FreeCAD output exceeds ${MAX_OUTPUT_BYTES} bytes; the headless FreeCAD session was restarted and unsaved documents were lost`));
        return;
      }
      this.stdoutBuffer += chunk.toString();
      if (this.pendingMarker && this.stdoutBuffer.includes(this.pendingMarker)) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve?.(this.stdoutBuffer);
      }
    });

    proc.stderr!.on('data', () => {});
    // An EPIPE on a dead REPL surfaces through 'exit'/'error' below; never as an unhandled error.
    proc.stdin!.on('error', () => {});

    proc.on('exit', () => {
      if (this.process !== proc) return;
      const reject = this.pendingReject;
      this.resetProcess();
      reject?.(new Error('FreeCAD process exited unexpectedly'));
    });

    proc.on('error', (err) => {
      if (this.process !== proc) return;
      const reject = this.pendingReject;
      this.resetProcess();
      reject?.(new Error(`Failed to start FreeCAD (${pythonBin}): ${err.message}`));
    });

    this.ready = new Promise<void>((resolve, reject) => {
      this.pendingMarker = '__MCP_READY__';
      const timer = setTimeout(() => {
        this.resetProcess();
        reject(new Error(`FreeCAD initialization timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingResolve = () => {
        clearTimeout(timer);
        this.stdoutBuffer = '';
        this.stdoutBytes = 0;
        resolve();
      };
      this.pendingReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
    });
    // Callers await this.ready; this guard only keeps a failed start from counting as unhandled.
    this.ready.catch(() => {});

    return this.ready;
  }

  private async executeHeadless(pythonCode: string): Promise<FreeCADResult> {
    try {
      await this.ensureProcess();
      const proc = this.process!;

      const lines = pythonCode.split('\n');
      const header = `__MCP_EXEC__:${lines.length}\n`;
      const payload = lines.join('\n') + '\n';

      this.stdoutBuffer = '';
      this.stdoutBytes = 0;
      this.pendingMarker = `${RESULT_MARKER}END`;

      const outputPromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.resetProcess();
          reject(new Error(`FreeCAD execution timed out after ${this.timeout}ms; the headless FreeCAD session was restarted and unsaved documents were lost`));
        }, this.timeout);

        this.pendingResolve = (val: string) => {
          clearTimeout(timer);
          resolve(val);
        };
        this.pendingReject = (err: Error) => {
          clearTimeout(timer);
          reject(err);
        };
      });

      proc.stdin!.write(header + payload);

      const output = await outputPromise;
      this.stdoutBuffer = '';
      this.stdoutBytes = 0;

      const startIdx = output.indexOf(RESULT_MARKER);
      if (startIdx === -1) {
        return { success: false, error: 'No result marker in output', output };
      }

      const jsonStart = startIdx + RESULT_MARKER.length;
      const endIdx = output.indexOf(`${RESULT_MARKER}END`, jsonStart);
      const jsonStr = output.substring(jsonStart, endIdx).trim();
      const firstLine = jsonStr.split('\n')[0].trim();
      const result = JSON.parse(firstLine) as FreeCADResult;
      result.output = output.substring(0, startIdx).trim();
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  private async executeNow(pythonCode: string): Promise<FreeCADResult> {
    // Auto-detect mode on first call
    if (this.useSocket === null) {
      this.useSocket = await this.checkSocket();
      if (this.useSocket) {
        console.error('[FreeCAD MCP] Connected to FreeCAD GUI via socket');
      } else {
        console.error('[FreeCAD MCP] GUI socket not available, using headless mode');
      }
    }

    if (this.useSocket) {
      const result = await this.executeSocket(pythonCode);
      // If socket fails mid-session, fall back to headless
      if (!result.success && result.error?.includes('Socket error')) {
        console.error('[FreeCAD MCP] Socket connection lost, switching to headless mode');
        this.useSocket = false;
        return this.executeHeadless(pythonCode);
      }
      return result;
    }

    return this.executeHeadless(pythonCode);
  }

  // --- Public API ---

  /** Runs the code; calls on one instance are queued and run one at a time. Never rejects. */
  execute(pythonCode: string): Promise<FreeCADResult> {
    const run = this.queue.then(() => this.executeNow(pythonCode)).catch((err: unknown) => ({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    this.queue = run;
    return run;
  }

  async run(pythonCode: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const result = await this.execute(pythonCode);
    if (!result.success) {
      return {
        content: [{ type: 'text', text: `FreeCAD error: ${result.error}` }],
        isError: true,
      };
    }
    const text = typeof result.result === 'object'
      ? JSON.stringify(result.result, null, 2)
      : String(result.result ?? result.output ?? 'OK');
    return {
      content: [{ type: 'text', text }],
    };
  }

  /** Force re-detection of socket vs headless mode */
  resetMode(): void {
    this.useSocket = null;
  }

  destroy(): void {
    const proc = this.process;
    if (proc) {
      const reject = this.pendingReject;
      try { proc.stdin!.end(); } catch { /* already closed */ }
      this.resetProcess();
      reject?.(new Error('FreeCAD bridge destroyed'));
    }
    if (this.replDir) {
      try { rmSync(this.replDir, { recursive: true, force: true }); } catch { /* best effort */ }
      this.replDir = null;
      this.replScriptPath = null;
    }
  }
}

import { spawn, ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as net from 'node:net';
import { FreeCADResult } from './types.js';

const DEFAULT_FREECAD_APP = '/Applications/FreeCAD.app/Contents/Resources';
const RESULT_MARKER = '__MCP_RESULT__';
const SOCKET_PORT = 12345;
const SOCKET_HOST = '127.0.0.1';

/**
 * Persistent FreeCAD bridge.
 * Supports two modes:
 *   - Socket mode: connects to a running FreeCAD GUI with the MCP server macro
 *   - Headless mode: spawns a freecadcmd Python REPL (fallback)
 */
export class FreeCADBridge {
  private freecadApp: string;
  private timeout: number;
  private process: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private stdoutBuffer = '';
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;
  private pendingMarker = '';
  private replScriptPath: string;
  private useSocket: boolean | null = null; // null = auto-detect

  constructor(freecadCmd?: string, timeout: number = 30000) {
    const cmd = freecadCmd || process.env.FREECAD_CMD || `${DEFAULT_FREECAD_APP}/bin/freecadcmd`;
    const match = cmd.match(/^(.+\/Contents\/Resources)/);
    this.freecadApp = match ? match[1] : DEFAULT_FREECAD_APP;
    this.timeout = timeout;
    this.replScriptPath = join(tmpdir(), 'freecad-mcp-repl.py');
  }

  private async checkSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(1000);
      client.connect(SOCKET_PORT, SOCKET_HOST, () => {
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

  private async executeSocket(pythonCode: string): Promise<FreeCADResult> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      let data = '';
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.destroy();
          resolve({ success: false, error: `Socket execution timed out after ${this.timeout}ms` });
        }
      }, this.timeout);

      client.connect(SOCKET_PORT, SOCKET_HOST, () => {
        client.write(pythonCode + '\n__MCP_END__\n');
      });

      client.on('data', (chunk) => {
        data += chunk.toString();
      });

      client.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          try {
            const result = JSON.parse(data) as FreeCADResult;
            resolve(result);
          } catch {
            resolve({ success: false, error: 'Failed to parse response from FreeCAD GUI' });
          }
        }
      });

      client.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ success: false, error: `Socket error: ${err.message}` });
        }
      });
    });
  }

  // --- Headless mode (original) ---

  private async ensureProcess(): Promise<void> {
    if (this.ready && this.process && this.process.exitCode === null) {
      return this.ready;
    }

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

    await writeFile(this.replScriptPath, replScript, 'utf-8');

    const pythonBin = `${this.freecadApp}/bin/python`;
    const libPath = `${this.freecadApp}/lib`;

    this.process = spawn(pythonBin, ['-u', this.replScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: libPath,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.stdoutBuffer = '';

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      if (this.pendingMarker && this.stdoutBuffer.includes(this.pendingMarker)) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve?.(this.stdoutBuffer);
      }
    });

    this.process.stderr!.on('data', () => {});

    this.process.on('exit', () => {
      if (this.pendingReject) {
        const reject = this.pendingReject;
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error('FreeCAD process exited unexpectedly'));
      }
    });

    this.process.on('error', (err) => {
      if (this.pendingReject) {
        const reject = this.pendingReject;
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(err);
      }
    });

    this.ready = new Promise<void>((resolve, reject) => {
      this.pendingMarker = '__MCP_READY__';
      const timer = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error('FreeCAD initialization timed out'));
      }, this.timeout);

      this.pendingResolve = () => {
        clearTimeout(timer);
        this.stdoutBuffer = '';
        resolve();
      };
      this.pendingReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
    });

    return this.ready;
  }

  private async executeHeadless(pythonCode: string): Promise<FreeCADResult> {
    await this.ensureProcess();
    const proc = this.process!;

    const lines = pythonCode.split('\n');
    const header = `__MCP_EXEC__:${lines.length}\n`;
    const payload = lines.join('\n') + '\n';

    this.stdoutBuffer = '';
    this.pendingMarker = `${RESULT_MARKER}END`;

    const outputPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error(`FreeCAD execution timed out after ${this.timeout}ms`));
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

    try {
      const output = await outputPromise;

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

  // --- Public API ---

  async execute(pythonCode: string): Promise<FreeCADResult> {
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
    if (this.process) {
      this.process.stdin!.end();
      this.process.kill();
      this.process = null;
      this.ready = null;
    }
  }
}

# Security Policy

freecad-mcp is an MCP server that drives FreeCAD. The MCP client (an LLM, in practice)
chooses every tool argument, so **tool inputs are untrusted**. The server is a local
process started by your MCP client over stdio; it has no accounts, no telemetry and no
network listener of its own.

## Supported versions

| Version | Supported |
|---|---|
| 2.0.x | Current |

Single maintainer; only the latest release receives fixes.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately:
**[Report a vulnerability](https://github.com/sergiudanstan/freecad-mcp/security/advisories/new)**
(Security -> Advisories -> Report a vulnerability).

| Stage | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Triage | within 10 business days |
| Fix, or a documented decision not to fix | within 90 days |

These are best-effort targets from a single unpaid maintainer, not a contractual SLA.
There is no bug bounty; credit is offered in the advisory and changelog.

## Scope and attack surface

What this server can reach, and what that means:

- **Code execution.** The `freecad_execute_python` tool runs arbitrary Python inside
  FreeCAD by design, and so do all other tools (they build Python source that FreeCAD
  executes). The code runs with the permissions of the user who started FreeCAD, with no
  sandbox. Connect only an MCP client you trust, and do not point it at untrusted
  documents or prompts. A report that `freecad_execute_python` can execute code is not a
  vulnerability; a way to run code *without* calling it, from input that should be inert,
  is in scope.
- **File system.** Import/export tools read and write files at paths the client supplies.
  `validateFilePath` (in `src/validation.ts`) requires absolute paths and rejects `..`
  traversal, null bytes and `/etc/`, `/proc/`, `/sys/`, `/dev/`, `/var/run/`, `/var/log/`.
  It is a guard against mistakes, not a sandbox: it is not an allow-list, it is applied by
  the import/export handlers rather than uniformly, and `freecad_execute_python` can read
  and write anything the FreeCAD user can.
- **Input handling.** Every tool handler (`handle*Tool` in `src/tools/`) first validates its
  arguments against the tool's `inputSchema` (`validateToolArgs` in `src/validation.ts`):
  required properties present, strict types (`number`/`integer` finite, `boolean` a real
  boolean, `"10"` is not a number), `enum`, and arrays and
  nested objects checked recursively, with unknown keys inside nested objects rejected
  (unknown top-level keys are ignored). Range checks (for example positive dimensions) are not
  part of this schema check; they stay in the tool handlers that already had them
  (`validatePositiveNumber`, `validateNumber`). A rejected call never reaches FreeCAD. Every string
  that goes into generated Python is serialized with `JSON.stringify`, so tool arguments
  are inert data. `test/injection.test.mjs` sends payloads into every property of every
  tool and fails if one turns into code. Because `freecad_execute_python` exists, an
  injection gains nothing that tool does not already grant, but any way to make another
  tool's input run as code is a bug worth reporting.
- **Network.** The GUI mode talks to `freecad_server.FCMacro`, which listens on
  `127.0.0.1:12345` and is not reachable from other machines. On every start the macro
  generates a random token (`secrets.token_hex(32)`) and writes it to
  `~/.freecad-mcp/token` (directory 0700, file 0600); the server reads that file and sends
  the token as the first line of each request. The macro compares it with
  `hmac.compare_digest` and closes the connection without running anything if it is missing
  or wrong. Each refused request that sent data leaves a warning in the FreeCAD report view,
  without the token; an empty connection (the bridge's mode detection) leaves none. This keeps other local users out; it does not protect against other processes
  running as your own user, which can read the token file. The macro serves one connection
  at a time, so a local client that connects and stays silent blocks it until it goes away.
- **Temporary files.** Headless mode writes its REPL script into a private folder created
  with `mkdtemp` in the system temporary directory (mode 0700, the file created exclusively
  with mode 0600, one folder per server instance) and runs it with `freecadcmd`. The folder
  is removed by `FreeCADBridge.destroy()`; the stdio server does not call it on exit, so a
  private `freecad-mcp-*` folder can be left in the temporary directory. A call that times out kills the headless FreeCAD
  process; the next call starts a new one, and documents that were not saved are lost.

In scope: bypasses of the documented validation, code or file access reachable from input
that should be inert, the macro accepting connections from a non-loopback address, and
anything in this repository's workflows that could publish a release not built from `main`.

Out of scope: vulnerabilities in FreeCAD, Node.js or the MCP SDK themselves (report
upstream), and the behaviour of `freecad_execute_python` itself.

## Supply chain

CI runs the test suite on every push and pull request, `npm audit` on the dependencies, CodeQL, and `zizmor`
on the workflows. `pip-audit` checks the hash-pinned CI toolchain. Actions are pinned to
full commit SHAs and kept current by Dependabot. Releases attach a source archive with
Sigstore build provenance:

```
gh attestation verify freecad-mcp-v1.1.tar.gz --repo sergiudanstan/freecad-mcp
```

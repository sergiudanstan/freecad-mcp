# Security Policy

freecad-mcp is an MCP server that drives FreeCAD. The MCP client (an LLM, in practice)
chooses every tool argument, so **tool inputs are untrusted**. The server is a local
process started by your MCP client over stdio; it has no accounts, no telemetry and no
network listener of its own.

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | Current |

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
- **Input handling.** Strings are escaped (`escapePythonString`, `JSON.stringify`) before
  they are placed into generated Python. Numeric range checks (`validateNumber` and
  friends) are applied in some tool modules, not all; several handlers cast arguments
  without checking them, and the server does not validate arguments against each tool's
  `inputSchema` itself. Because `freecad_execute_python` exists, an injection through a
  numeric argument gains nothing that tool does not already grant, but it is still a bug
  worth reporting if it bypasses a check that is documented.
- **Network.** The GUI mode talks to `freecad_server.FCMacro`, which listens on
  `127.0.0.1:12345`. It is not reachable from other machines, but it has **no
  authentication**: any local process or local user can connect and run Python in your
  FreeCAD session. Run the macro only on a machine you do not share.
- **Temporary files.** Headless mode writes a REPL script to a fixed name in the system
  temporary directory (`freecad-mcp-repl.py`) and runs it with `freecadcmd`. On a
  multi-user machine another user could pre-create that path; use headless mode only on a
  single-user machine.

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

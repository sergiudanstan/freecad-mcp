# freecad-mcp

[![CI](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sergiudanstan/freecad-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/sergiudanstan/freecad-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MCP (Model Context Protocol) server for FreeCAD parametric 3D CAD modeling. Provides 165 tools across 15 modules for document management, primitives, booleans, sketching, part design, meshing, FEM, BIM, and more.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [FreeCAD](https://www.freecad.org/) 1.0 or later installed (the generated code follows the 1.1 API)

## Installation

```bash
git clone https://github.com/sergiudanstan/freecad-mcp.git
cd freecad-mcp
npm install
npm run build
```

### Upgrading from 1.x

2.0.0 has two breaking changes:

- **Restart the macro.** In GUI mode, stop `freecad_server.FCMacro` in FreeCAD and run the 2.0.0 copy.
  The new macro writes the token the server needs (see Step 1 below); with an older macro the server
  reports `FreeCAD GUI token not found`.
- **Arguments are checked against each tool's schema.** A value of the wrong type is now an error, for
  example `"10"` for a number or `"true"` for a boolean. Clients that follow the tool schemas need no
  change.

## Setup

The server supports two modes: **GUI mode** (recommended) and **headless mode** (fallback).

### GUI Mode (recommended)

GUI mode connects to a running FreeCAD instance so you can see changes live in the 3D viewport.

**Step 1 — Start the FreeCAD socket server macro:**

1. Open FreeCAD
2. Go to **Macro > Macros...**
3. Click **"..."** (browse) and navigate to the `freecad_server.FCMacro` file in this repo
4. Select it and click **Execute**
5. You should see in the FreeCAD console:
   ```
   MCP Socket Server listening on 127.0.0.1:12345
   MCP Server: auth token written to /Users/<you>/.freecad-mcp/token
   MCP Server macro loaded. Waiting for connections...
   ```

The macro must be running **before** the MCP server connects. The server auto-detects the socket on startup.

**Token.** On every start the macro generates a new random token and writes it to `~/.freecad-mcp/token`
(readable only by you). The MCP server reads that file and sends the token with each request; the macro
refuses requests without the right token. Nothing needs configuring, but after updating freecad-mcp
(2.0.0 or later) you must stop and restart the macro in FreeCAD: an older macro does not write a token, and
the server then reports `FreeCAD GUI token not found`.

**Step 2 — Configure your MCP client:**

Add the server to your MCP client configuration. For Claude Code, add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "freecad": {
      "command": "node",
      "args": ["/path/to/freecad-mcp/dist/index.js"]
    }
  }
}
```

Or via the CLI:

```bash
claude mcp add freecad node /path/to/freecad-mcp/dist/index.js
```

### Headless Mode (fallback)

If FreeCAD GUI is not running, the server automatically falls back to headless mode using `freecadcmd`. This works for scripting and automation but you won't see visual output.

By default the server uses `freecadcmd` from your `PATH`, falling back to `/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd` on macOS. Override with:

```json
{
  "mcpServers": {
    "freecad": {
      "command": "node",
      "args": ["/path/to/freecad-mcp/dist/index.js"],
      "env": {
        "FREECAD_CMD": "/your/path/to/freecadcmd"
      }
    }
  }
}
```

## Tool Modules

| Module | Tools | Description |
|--------|-------|-------------|
| Document | 6 | New, open, save, close, list objects, get info |
| Primitives | 11 | Box, cylinder, sphere, cone, torus, tube, prism, helix, spiral, ellipsoid, wedge |
| Operations | 17 | Boolean (fuse/cut/intersect/XOR/fragments), fillet, chamfer, move, rotate, copy, mirror, slice |
| Sketcher | 16 | Create sketches, add lines, arcs, circles, constraints, close/validate |
| Part Design | 20 | Pad, pocket, revolve, hole, groove, chamfer, fillet, mirror, linear/polar pattern |
| Import/Export | 17 | STEP, STL, OBJ, IGES, DXF, SVG, BREP import/export, measurements, Python execution |
| Draft | 17 | Wire, rectangle, circle, polygon, BSpline, array, clone, offset, upgrade/downgrade |
| Mesh | 7 | Tessellate, mesh-to-shape, repair, decimate, refine, info, boolean |
| TechDraw | 6 | Drawing pages, views, dimensions, annotations |
| Advanced | 11 | Loft, sweep, pipe, thickness, offset surface, section, projection |
| Spreadsheet | 5 | Create, set cells, get cells, alias, formulas |
| BIM | 9 | Walls, columns, slabs, windows, roofs, stairs, spaces |
| FEM | 8 | Analysis, material, constraints, mesh generation, solver |
| Surface | 5 | Filling, curves on mesh, extending, trimming |
| Assembly | 10 | Assembly creation, constraints, bill of materials |

## Security

- Every tool validates its arguments against its `inputSchema` before any Python is generated, and strings go into generated Python as JSON literals; file-path checks (absolute paths only, no `..`, system paths blocked) are applied in the tool modules that use `validateFilePath`, not uniformly across all of them
- The `freecad_execute_python` tool allows arbitrary Python execution by design — only use in trusted environments
- The GUI socket server listens only on localhost (`127.0.0.1:12345`) and requires the token from `~/.freecad-mcp/token` (mode 0600), so other local users cannot run Python in your FreeCAD session; processes running as your own user can still read the token

See [SECURITY.md](SECURITY.md) for the threat model and vulnerability reporting.

## Development

`npm ci && npm test` builds the server and runs the tests (no FreeCAD needed). See [CONTRIBUTING.md](CONTRIBUTING.md) for branches and releases, [SECURITY.md](SECURITY.md) for reporting vulnerabilities, and [CHANGELOG.md](CHANGELOG.md) for history.

## License

[MIT](LICENSE) - Dan Stan

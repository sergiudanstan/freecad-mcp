# freecad-mcp

[![CI](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/sergiudanstan/freecad-mcp/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sergiudanstan/freecad-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/sergiudanstan/freecad-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MCP (Model Context Protocol) server for FreeCAD parametric 3D CAD modeling. Provides 165 tools across 15 modules for document management, primitives, booleans, sketching, part design, meshing, FEM, BIM, and more.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [FreeCAD](https://www.freecad.org/) 0.21 or later installed

## Installation

```bash
git clone https://github.com/sergiudanstan/freecad-mcp.git
cd freecad-mcp
npm install
npm run build
```

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
   MCP Server macro loaded. Waiting for connections...
   ```

The macro must be running **before** the MCP server connects. The server auto-detects the socket on startup.

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

The server looks for `freecadcmd` at `/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd` by default. Override with:

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
| Document | 7 | New, open, save, close, list objects, get info |
| Primitives | 11 | Box, cylinder, sphere, cone, torus, tube, prism, helix, spiral, ellipsoid, wedge |
| Operations | 17 | Boolean (fuse/cut/intersect/XOR/fragments), fillet, chamfer, move, rotate, copy, mirror, slice |
| Sketcher | 12 | Create sketches, add lines, arcs, circles, constraints, close/validate |
| Part Design | 10 | Pad, pocket, revolve, hole, groove, chamfer, fillet, mirror, linear/polar pattern |
| Import/Export | 16 | STEP, STL, OBJ, IGES, DXF, SVG, BREP import/export, measurements, Python execution |
| Draft | 10 | Wire, rectangle, circle, polygon, BSpline, array, clone, offset, upgrade/downgrade |
| Mesh | 7 | Tessellate, mesh-to-shape, repair, decimate, refine, info, boolean |
| TechDraw | 8 | Drawing pages, views, dimensions, annotations |
| Advanced | 12 | Loft, sweep, pipe, thickness, offset surface, section, projection |
| Spreadsheet | 6 | Create, set cells, get cells, alias, formulas |
| BIM | 8 | Walls, columns, slabs, windows, roofs, stairs, spaces |
| FEM | 10 | Analysis, material, constraints, mesh generation, solver |
| Surface | 8 | Filling, curves on mesh, extending, trimming |
| Assembly | 8 | Assembly creation, constraints, bill of materials |

## Security

- Strings are escaped before they go into generated Python; numeric range checks and file-path checks (absolute paths only, no `..`, system paths blocked) are applied in the tool modules that use `src/validation.ts`, not uniformly across all of them
- The `freecad_execute_python` tool allows arbitrary Python execution by design — only use in trusted environments
- The GUI socket server listens only on localhost (`127.0.0.1:12345`) and has no authentication: any local process can run Python in your FreeCAD session

See [SECURITY.md](SECURITY.md) for the threat model and vulnerability reporting.

## Development

`npm ci && npm test` builds the server and runs the tests (no FreeCAD needed). See [CONTRIBUTING.md](CONTRIBUTING.md) for branches and releases, [SECURITY.md](SECURITY.md) for reporting vulnerabilities, and [CHANGELOG.md](CHANGELOG.md) for history.

## License

[MIT](LICENSE) - Dan Stan

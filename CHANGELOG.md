# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-11-28

### Security
- Tool arguments could be turned into code: 109 of the 164 tools (all except
  `freecad_execute_python`) placed numbers, booleans or strings into generated Python without
  checking or quoting them, so a crafted argument ran arbitrary Python in FreeCAD without calling
  `freecad_execute_python`. 108 were found by an external probe, the 109th
  (`freecad_mesh_decimate`, through the mesh name in its error message) by the new regression test.
  Every tool handler now validates its arguments against the tool's `inputSchema` before
  generating any Python (types, `enum`, nested arrays and objects), and every
  string goes into Python as a JSON literal. `test/injection.test.mjs` checks every property of
  every tool, and that every tool is reached by the payloads.
- `freecad_server.FCMacro` requires a token: on every start it writes a random token to
  `~/.freecad-mcp/token` (directory 0700, file 0600), the server sends it with each request, and the
  macro runs nothing when it is missing or wrong (compared with `hmac.compare_digest`). Each request
  refused for a missing or wrong token that sent data leaves a warning in the FreeCAD report view,
  without the token. Requests
  larger than 10 MiB are refused. Restart the macro in FreeCAD after updating.
- The headless REPL script is written into a private `mkdtemp` folder (0700, file created
  exclusively with 0600) instead of the fixed path `$TMPDIR/freecad-mcp-repl.py`.

### Fixed
- Headless bridge: calls are serialized (one at a time, in order), so concurrent calls no longer
  receive each other's results.
- Headless bridge: a call that times out kills the FreeCAD process; the next call starts a new one
  and the late output of the old call can no longer be returned to it. Documents that were not saved
  in the headless session are lost on a timeout, and the error message says so.
- The output of one call (headless stdout or GUI socket reply) is capped at 10 MiB; above it the call
  fails and the channel is reset.
- Two concurrent first calls start a single headless FreeCAD process instead of two.

### Changed
- Compatibility: arguments are now validated strictly against each tool's `inputSchema`. A value of the
  wrong type (for example `"10"` for a `number`) or an unknown key inside a nested object is an error;
  unknown top-level keys are still ignored.
- The version reported to MCP clients and on stderr is the package version (was `2.0.0`).

## [1.2.0] - 2026-11-26

### Fixed
FreeCAD 1.x API, checked against the FreeCAD 1.1.4 sources:
- Results containing FreeCAD quantities or vectors are encoded as numbers and lists by both
  the headless bridge and the socket macro, instead of failing in `json.dumps`.
- Assembly joints are `JointObject` proxies created in the assembly's JointGroup; grounding
  uses `GroundedJoint`; a distance is set before the joint is solved; `freecad_assembly_solve`
  now calls `assembly.solve()` and reports the solver status.
- `freecad_boolean_fuse` and `freecad_boolean_intersect` link `Base`/`Tool`;
  `freecad_join_connect` and `freecad_join_cutout` use `BOPTools.JoinFeatures`.
- `freecad_fem_mesh` sets `Shape` (renamed from `Part` in 1.0) and counts elements from
  `EdgeCount`/`FaceCount`/`VolumeCount`; the CalculiX solver uses `makeSolverCalculiXCcxTools`.
- `freecad_arch_stairs` passes steps, height, width and name to `Arch.makeStairs`;
  `freecad_export_ifc` uses `importers.exportIFC`.
- `freecad_surface_filling` sets `BoundaryEdges`, `freecad_surface_geomfill` sets `BoundaryList`.
- `freecad_pad` with `symmetric` sets `SideType = "Symmetric"`.
- `freecad_partdesign_fillet` and `freecad_partdesign_chamfer` create the feature in the
  object's Body and say so when the object is not in one.
- `freecad_sketch_fillet` maps `vertexIndex` with `getGeoVertexIndex` before calling
  `Sketch.fillet(geoId, pos, radius)`.
- `freecad_import_iges` reads through `Part.insert`, so it works without the GUI.
- Result dictionaries no longer contain JavaScript `true`/`false`.

### Changed
- FreeCAD 1.0 or later is required (was 0.21).

### Added
- Offline tests that check the generated Python against the 1.x API.

## [1.1.3] - 2026-11-26

### Security
- Dependency updates (lockfile): hono 4.13.17 -> 4.13.22. The other Dependabot bumps
  (body-parser 2.4.0, proxy-addr 2.0.8, @modelcontextprotocol/sdk 1.32.2, ip-address 10.7.6,
  express-rate-limit 8.7.4, path-to-regexp 8.4.2, qs 6.17.1, fast-uri 3.1.9, zod 4.6.7) were
  already in the lockfile at or above the proposed versions.

## [1.1.2] - 2026-11-26

### Fixed
- README per-module tool table summed to 150 while the intro and `package.json` said 165; the
  counts now match the tool arrays in the code (Import/Export 17, Part Design 20, Sketcher 16,
  Draft 17, and so on).
- The headless FreeCAD binary no longer defaults only to the macOS app path: `FREECAD_CMD` if set,
  else `freecadcmd` on `PATH`, else the macOS path (unchanged on macOS).

### Added
- Tests that fail if the README table drifts from the code, and for the binary resolution.

## [1.1.1] - 2026-11-25

### Fixed
- The release workflow builds the SBOM from `package-lock.json` (`npm sbom --package-lock-only`).
  It used to run after an install without devDependencies, and `npm sbom` refused the incomplete
  tree, so the `v1.1.0` tag never produced a release. That tag is kept as it is; this is the first
  published release.

## [1.1.0] - 2026-11-25

First tagged release. freecad-mcp is an MCP server for FreeCAD with 165 tools across
15 modules, talking to a running FreeCAD GUI over a localhost socket or to `freecadcmd`
headless; the code itself is unchanged from the 1.0.0 source release below.

### Added
- Tests (`npm test`): validation helpers, and the tool registry plus input rejection over a
  real MCP stdio session. They run in CI and do not need FreeCAD.
- CI (build, tests, macro syntax check, `npm audit`, `pip-audit` of the CI toolchain,
  `zizmor`), CodeQL, OpenSSF Scorecard and a tag-triggered release workflow with an SBOM
  and build provenance; Dependabot for actions and npm.
- Rewritten `SECURITY.md` (private reporting, scope for an MCP server that executes code)
  and `CONTRIBUTING.md`.

### Security
- Updated locked dependencies to clear all advisories reported by `npm audit`
  (`@modelcontextprotocol/sdk`, `hono`, `@hono/node-server`, `qs`, `body-parser`,
  `path-to-regexp` and others); `package.json` ranges are unchanged.

### Fixed
- README no longer claims that every input is validated; it now matches what the code does.

## [1.0.0] - 2026-03-08

### Added
- Initial open-source release
- 165 FreeCAD tools across 15 modules: document, primitives, operations, sketcher, part-design, import-export, draft, mesh, techdraw, advanced-operations, spreadsheet, BIM, FEM, surface, assembly
- Dual-mode FreeCAD bridge: GUI socket mode and headless subprocess mode
- Auto-detection of FreeCAD GUI availability
- Input validation module with numeric range checks, string sanitization, and path traversal prevention
- SECURITY.md with vulnerability disclosure policy
- CONTRIBUTING.md with development guidelines

### Security
- Added runtime input validation for all tool parameters
- Fixed string escaping to include newline characters
- Added file path traversal prevention for import/export operations
- Added security warning to `freecad_execute_python` tool description

[Unreleased]: https://github.com/sergiudanstan/freecad-mcp/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/sergiudanstan/freecad-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/sergiudanstan/freecad-mcp/releases/tag/v1.1.1
[1.1.0]: https://github.com/sergiudanstan/freecad-mcp/releases/tag/v1.1.0

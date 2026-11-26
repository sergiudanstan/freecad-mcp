# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

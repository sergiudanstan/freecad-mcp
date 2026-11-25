# Contributing

Contributions are welcome. This is a single-maintainer project, so please open an issue
before starting anything substantial.

**Security problems do not belong in issues.** Follow [SECURITY.md](SECURITY.md).

## Branches, pull requests and releases

- `main` is the only long-lived branch and is protected: changes land through a pull
  request with the required checks green, commits on `main` are signed, and force-pushes
  are refused. Pull requests are squash-merged; GitHub deletes the branch on merge.
- Branch names: `<type>/<topic>` (`feat/`, `fix/`, `docs/`, `chore/`, `release/`);
  agents use `agent/<name>/<topic>`.
- A release is a pull request that bumps `version` in `package.json` (the single version
  source) and moves `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to a dated version.
  After it merges, a signed `vX.Y.Z` tag on that commit triggers `release.yml`, which
  refuses to run if the tag, `package.json` and the changelog disagree. Tags are never
  moved or deleted.

## Running it locally

```bash
npm ci
npm run build                          # tsc, strict mode -> dist/
npm test                               # build, then node --test test/*.test.mjs
node dist/index.js                     # stdio MCP server (FreeCAD not needed to start it)
```

The tests need Node.js >= 22 and **do not need FreeCAD**: they check the tool registry,
the validation helpers and the errors returned over a real MCP stdio session. Anything
that actually drives FreeCAD (0.21 or later) must be tried by hand against a running
FreeCAD or `freecadcmd`.

## Code style for tools

- TypeScript strict mode; match the surrounding style.
- Pass strings to generated Python through `escapeString` / `JSON.stringify`, never by
  plain interpolation.
- Use `validateNumber` / `validatePositiveNumber` / `validateString` from
  `src/validation.ts` for new parameters and `validateFilePath` for every file path.
- A new tool goes in its module under `src/tools/`, with an `inputSchema`, a handler case
  and a registration in `src/index.ts`; update the tool count in the README and the test
  that asserts it.

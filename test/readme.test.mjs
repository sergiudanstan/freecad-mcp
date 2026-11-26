// The README's per-module tool table must match the tool arrays in the code,
// so the documented counts cannot drift from what the server registers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MODULES = {
  Document: ['document', 'DOCUMENT_TOOLS'],
  Primitives: ['primitives', 'PRIMITIVE_TOOLS'],
  Operations: ['operations', 'OPERATION_TOOLS'],
  Sketcher: ['sketcher', 'SKETCHER_TOOLS'],
  'Part Design': ['part-design', 'PART_DESIGN_TOOLS'],
  'Import/Export': ['import-export', 'IMPORT_EXPORT_TOOLS'],
  Draft: ['draft', 'DRAFT_TOOLS'],
  Mesh: ['mesh', 'MESH_TOOLS'],
  TechDraw: ['techdraw', 'TECHDRAW_TOOLS'],
  Advanced: ['advanced-operations', 'ADVANCED_OPERATION_TOOLS'],
  Spreadsheet: ['spreadsheet', 'SPREADSHEET_TOOLS'],
  BIM: ['bim', 'BIM_TOOLS'],
  FEM: ['fem', 'FEM_TOOLS'],
  Surface: ['surface', 'SURFACE_TOOLS'],
  Assembly: ['assembly', 'ASSEMBLY_TOOLS'],
};

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const rows = [...readme.matchAll(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm)].map((m) => [m[1], Number(m[2])]);

test('README tool table lists every module exactly once', () => {
  assert.deepEqual(rows.map((r) => r[0]).sort(), Object.keys(MODULES).sort());
});

test('README per-module tool counts equal the counts in code', async () => {
  for (const [name, count] of rows) {
    const [file, exportName] = MODULES[name];
    const mod = await import(`../dist/tools/${file}.js`);
    assert.equal(count, mod[exportName].length, `README says ${name} has ${count} tools`);
  }
});

test('README table sums to the total in the intro and in package.json', () => {
  const total = rows.reduce((s, r) => s + r[1], 0);
  assert.match(readme, new RegExp(`Provides ${total} tools`));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.description, new RegExp(`${total} tools`));
});

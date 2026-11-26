// The Python each tool sends must match the FreeCAD 1.x API (checked against the
// FreeCAD 1.1.4 sources). A stub bridge records the code, so FreeCAD is not needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleAdvancedOperationTool } from '../dist/tools/advanced-operations.js';
import { handleAssemblyTool } from '../dist/tools/assembly.js';
import { handleBimTool } from '../dist/tools/bim.js';
import { handleDraftTool } from '../dist/tools/draft.js';
import { handleFemTool } from '../dist/tools/fem.js';
import { handleImportExportTool } from '../dist/tools/import-export.js';
import { handleOperationTool } from '../dist/tools/operations.js';
import { handlePartDesignTool } from '../dist/tools/part-design.js';
import { handleSketcherTool } from '../dist/tools/sketcher.js';
import { handleSurfaceTool } from '../dist/tools/surface.js';

async function pythonFor(handler, tool, args) {
  const sent = [];
  await handler(tool, args, { run: async (code) => { sent.push(code); return { content: [] }; } });
  assert.equal(sent.length, 1, `${tool} should send exactly one script`);
  return sent[0];
}

const joint = { assemblyName: 'Asm', component1: 'A', element1: 'Face1', component2: 'B', element2: 'Edge3' };

test('joints are JointObject proxies in the JointGroup', async () => {
  const py = await pythonFor(handleAssemblyTool, 'freecad_assembly_revolute_joint', joint);
  assert.ok(py.includes('UtilsAssembly.getJointGroup(assembly).newObject("App::FeaturePython"'));
  assert.ok(py.includes('JointObject.JointTypes.index("Revolute")'));
  assert.ok(py.includes('[parts["c2"], ["Edge3", "Edge3"]]'));
  assert.ok(!py.includes('Assembly::Joint'));
});

test('distance is set before the connectors solve the joint', async () => {
  const py = await pythonFor(handleAssemblyTool, 'freecad_assembly_distance_joint', { ...joint, distance: 12 });
  assert.ok(py.indexOf('joint.Distance = 12') < py.indexOf('setJointConnectors'));
});

test('grounding uses GroundedJoint and solving calls assembly.solve()', async () => {
  const ground = await pythonFor(handleAssemblyTool, 'freecad_assembly_toggle_grounded', { assemblyName: 'Asm', componentName: 'A' });
  assert.ok(ground.includes('JointObject.GroundedJoint(grounded, comp)'));
  const solve = await pythonFor(handleAssemblyTool, 'freecad_assembly_solve', { assemblyName: 'Asm' });
  assert.ok(solve.includes('assembly.solve()'));
});

test('Part booleans link Base and Tool', async () => {
  for (const [tool, v] of [['freecad_boolean_fuse', 'fuse'], ['freecad_boolean_intersect', 'common']]) {
    const py = await pythonFor(handleOperationTool, tool, { object1: 'A', object2: 'B' });
    assert.ok(py.includes(`${v}.Base, ${v}.Tool = o1, o2`), tool);
  }
});

test('join features come from BOPTools.JoinFeatures', async () => {
  const connect = await pythonFor(handleOperationTool, 'freecad_join_connect', { object1: 'A', object2: 'B' });
  assert.ok(connect.includes('JoinFeatures.makeConnect('));
  const cutout = await pythonFor(handleOperationTool, 'freecad_join_cutout', { object1: 'A', object2: 'B' });
  assert.ok(cutout.includes('JoinFeatures.makeCutout('));
  assert.ok(!(connect + cutout).includes('Part::Join'));
});

test('FEM mesh and solver use the 1.x names', async () => {
  const mesh = await pythonFor(handleFemTool, 'freecad_fem_mesh', { analysisName: 'An', objectName: 'Box' });
  assert.ok(mesh.includes('mesh.Shape = obj'));
  assert.ok(!mesh.includes('ElementCount'));
  const solver = await pythonFor(handleFemTool, 'freecad_fem_solver', { analysisName: 'An', solver: 'calculix' });
  assert.ok(solver.includes('ObjectsFem.makeSolverCalculiXCcxTools('));
});

test('stairs take keywords and IFC export uses importers.exportIFC', async () => {
  const stairs = await pythonFor(handleBimTool, 'freecad_arch_stairs', { numberOfSteps: 14 });
  assert.ok(stairs.includes('Arch.makeStairs(steps=14,'));
  const ifc = await pythonFor(handleBimTool, 'freecad_export_ifc', { filePath: '/tmp/x.ifc' });
  assert.ok(ifc.includes('from importers import exportIFC'));
  assert.ok(ifc.includes('exportIFC.export(objs, '));
});

test('surface features use BoundaryEdges and BoundaryList', async () => {
  const fill = await pythonFor(handleSurfaceTool, 'freecad_surface_filling', { objectName: 'S', edgeNames: ['Edge1'] });
  assert.ok(fill.includes('fill.BoundaryEdges = '));
  const gf = await pythonFor(handleSurfaceTool, 'freecad_surface_geomfill', { edges: [{ objectName: 'S', edgeName: 'Edge1' }] });
  assert.ok(gf.includes('gf.BoundaryList = '));
});

test('a symmetric pad sets SideType', async () => {
  const py = await pythonFor(handlePartDesignTool, 'freecad_pad', { sketchName: 'Sk', length: 5, symmetric: true });
  assert.ok(py.includes('pad.SideType = "Symmetric"'));
  assert.ok(!py.includes('pad.Symmetric'));
});

test('PartDesign fillet and chamfer are created inside the Body', async () => {
  for (const tool of ['freecad_partdesign_fillet', 'freecad_partdesign_chamfer']) {
    const py = await pythonFor(handlePartDesignTool, tool, { objectName: 'Pad', radius: 1, size: 1 });
    assert.ok(py.includes('body = obj.getParentGeoFeatureGroup()'), tool);
    assert.match(py, /= body\.newObject\("PartDesign::(Fillet|Chamfer)"/, tool);
  }
});

test('sketch fillet maps the vertex index to (geoId, pos)', async () => {
  const py = await pythonFor(handleSketcherTool, 'freecad_sketch_fillet', { sketchName: 'Sk', vertexIndex: 4, radius: 2 });
  assert.ok(py.includes('sketch.getGeoVertexIndex(4)'));
  assert.ok(py.includes('sketch.fillet(geo_id, pos_id, 2)'));
});

test('IGES import works headless through Part.insert', async () => {
  const py = await pythonFor(handleImportExportTool, 'freecad_import_iges', { filePath: '/tmp/x.igs' });
  assert.ok(py.includes('Part.insert('));
  assert.ok(!py.includes('ImportGui'));
});

test('no JavaScript true/false reaches the Python result dicts', async () => {
  const scripts = [
    await pythonFor(handleDraftTool, 'freecad_draft_move', { objectNames: ['A'], x: 1, y: 0, z: 0, copy: true }),
    await pythonFor(handleDraftTool, 'freecad_draft_wire', { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }),
    await pythonFor(handleAdvancedOperationTool, 'freecad_extrude', { objectName: 'F', dirZ: 1 }),
    await pythonFor(handlePartDesignTool, 'freecad_loft', { sketchNames: ['S1', 'S2'] }),
    await pythonFor(handleSketcherTool, 'freecad_add_sketch_bspline', { sketchName: 'Sk', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
  ];
  for (const py of scripts) assert.doesNotMatch(py, /:\s*(true|false)\b/);
});

test('both result channels encode FreeCAD quantities and vectors', () => {
  const repl = readFileSync(new URL('../src/freecad-bridge.ts', import.meta.url), 'utf8');
  const macro = readFileSync(new URL('../freecad_server.FCMacro', import.meta.url), 'utf8');
  for (const [name, src] of [['bridge', repl], ['macro', macro]]) {
    assert.ok(src.includes('isinstance(value, FreeCAD.Units.Quantity)'), name);
    assert.ok(src.includes('default=_mcp_json'), name);
  }
});

import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { pyBool, validatePositiveNumber, validateNumber, validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const MESH_TOOLS = [
  {
    name: 'freecad_mesh_from_shape',
    description: 'Convert a Part shape to a mesh (tessellate a solid/surface into triangles)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the Part object to tessellate' },
        linearDeflection: { type: 'number', description: 'Max linear deviation in mm (default 0.1, lower = finer mesh)' },
        angularDeflection: { type: 'number', description: 'Max angular deviation in degrees (default 30)' },
        name: { type: 'string', description: 'Name for the mesh object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_mesh_to_shape',
    description: 'Convert a mesh to a Part shape (reconstruct solid from triangles). Useful for editing imported STL files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        meshName: { type: 'string', description: 'Name of the Mesh object to convert' },
        sewing: { type: 'boolean', description: 'Try to sew the shape into a solid (default true)' },
        name: { type: 'string', description: 'Name for the resulting Part shape' },
      },
      required: ['meshName'],
    },
  },
  {
    name: 'freecad_mesh_repair',
    description: 'Repair a mesh by fixing defects (fill holes, remove duplicates, fix normals, merge close vertices)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        meshName: { type: 'string', description: 'Name of the Mesh object to repair' },
        fillHoles: { type: 'boolean', description: 'Fill holes in the mesh (default true)' },
        removeDuplicates: { type: 'boolean', description: 'Remove duplicate facets (default true)' },
        fixNormals: { type: 'boolean', description: 'Fix/harmonize face normals (default true)' },
      },
      required: ['meshName'],
    },
  },
  {
    name: 'freecad_mesh_decimate',
    description: 'Reduce the number of triangles in a mesh while preserving shape (mesh simplification)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        meshName: { type: 'string', description: 'Name of the Mesh object to decimate' },
        targetReduction: { type: 'number', description: 'Target reduction ratio (0.0-1.0, e.g. 0.5 = reduce by 50%)' },
      },
      required: ['meshName', 'targetReduction'],
    },
  },
  {
    name: 'freecad_mesh_refine',
    description: 'Subdivide/refine a mesh to increase triangle density',
    inputSchema: {
      type: 'object' as const,
      properties: {
        meshName: { type: 'string', description: 'Name of the Mesh object to refine' },
        maxEdgeLength: { type: 'number', description: 'Max edge length — edges longer than this will be split (in mm)' },
      },
      required: ['meshName', 'maxEdgeLength'],
    },
  },
  {
    name: 'freecad_mesh_info',
    description: 'Get mesh statistics: vertex count, facet count, surface area, volume, bounding box, and topology info',
    inputSchema: {
      type: 'object' as const,
      properties: {
        meshName: { type: 'string', description: 'Name of the Mesh object to inspect' },
      },
      required: ['meshName'],
    },
  },
  {
    name: 'freecad_mesh_boolean',
    description: 'Perform boolean operations on meshes (union, intersection, difference)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mesh1Name: { type: 'string', description: 'Name of the first mesh' },
        mesh2Name: { type: 'string', description: 'Name of the second mesh' },
        operation: {
          type: 'string',
          enum: ['union', 'intersection', 'difference'],
          description: 'Boolean operation type',
        },
        name: { type: 'string', description: 'Name for the result mesh' },
      },
      required: ['mesh1Name', 'mesh2Name', 'operation'],
    },
  },
];

export async function handleMeshTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(MESH_TOOLS, name, args);
  switch (name) {
    case 'freecad_mesh_from_shape': {
      const objectName = args.objectName as string;
      const linearDeflection = validatePositiveNumber((args.linearDeflection as number) ?? 0.1, 'linearDeflection', 1000);
      const angularDeflection = validatePositiveNumber((args.angularDeflection as number) ?? 30, 'angularDeflection', 180);
      const meshName = (args.name as string) || 'Mesh';
      return bridge.run(`
${DOC_PREAMBLE}
import Mesh, MeshPart
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
shape = obj.Shape
mesh_data = MeshPart.meshFromShape(Shape=shape, LinearDeflection=${linearDeflection}, AngularDeflection=${angularDeflection})
mesh_obj = doc.addObject("Mesh::Feature", ${JSON.stringify(meshName)})
mesh_obj.Mesh = mesh_data
doc.recompute()
m = mesh_obj.Mesh
_mcp_result["result"] = {"name": mesh_obj.Name, "vertices": m.CountPoints, "facets": m.CountFacets, "area": m.Area}
`);
    }

    case 'freecad_mesh_to_shape': {
      const meshName = args.meshName as string;
      const sewing = (args.sewing as boolean) ?? true;
      const shapeName = (args.name as string) || 'Shape';
      return bridge.run(`
${DOC_PREAMBLE}
mesh_obj = doc.getObject(${JSON.stringify(meshName)})
if mesh_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(meshName)})
shape = Part.Shape()
shape.makeShapeFromMesh(mesh_obj.Mesh.Topology, 0.1)
if ${pyBool(sewing)}:
    solid = Part.makeSolid(shape)
    shape_obj = doc.addObject("Part::Feature", ${JSON.stringify(shapeName)})
    shape_obj.Shape = solid
else:
    shape_obj = doc.addObject("Part::Feature", ${JSON.stringify(shapeName)})
    shape_obj.Shape = shape
doc.recompute()
_mcp_result["result"] = {"name": shape_obj.Name, "volume": shape_obj.Shape.Volume, "area": shape_obj.Shape.Area}
`);
    }

    case 'freecad_mesh_repair': {
      const meshName = args.meshName as string;
      const fillHoles = (args.fillHoles as boolean) ?? true;
      const removeDuplicates = (args.removeDuplicates as boolean) ?? true;
      const fixNormals = (args.fixNormals as boolean) ?? true;
      return bridge.run(`
${DOC_PREAMBLE}
mesh_obj = doc.getObject(${JSON.stringify(meshName)})
if mesh_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(meshName)})
m = mesh_obj.Mesh.copy()
before_facets = m.CountFacets
before_points = m.CountPoints
if ${pyBool(removeDuplicates)}:
    m.removeDuplicatedPoints()
    m.removeDuplicatedFacets()
if ${pyBool(fixNormals)}:
    m.harmonizeNormals()
    m.fixIndices()
if ${pyBool(fillHoles)}:
    m.fillupHoles(1000)
mesh_obj.Mesh = m
doc.recompute()
_mcp_result["result"] = {
    "name": mesh_obj.Name,
    "before": {"facets": before_facets, "vertices": before_points},
    "after": {"facets": m.CountFacets, "vertices": m.CountPoints}
}
`);
    }

    case 'freecad_mesh_decimate': {
      const meshName = args.meshName as string;
      const targetReduction = validateNumber(args.targetReduction, 'targetReduction', { min: 0.01, max: 0.99 });
      return bridge.run(`
${DOC_PREAMBLE}
mesh_obj = doc.getObject(${JSON.stringify(meshName)})
if mesh_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(meshName)})
m = mesh_obj.Mesh.copy()
before = m.CountFacets
target = int(before * (1.0 - ${targetReduction}))
m.decimate(target)
mesh_obj.Mesh = m
doc.recompute()
_mcp_result["result"] = {
    "name": mesh_obj.Name,
    "facets_before": before,
    "facets_after": m.CountFacets,
    "reduction": round(1.0 - m.CountFacets / before, 3) if before > 0 else 0
}
`);
    }

    case 'freecad_mesh_refine': {
      const meshName = args.meshName as string;
      const maxEdgeLength = validatePositiveNumber(args.maxEdgeLength, 'maxEdgeLength');
      return bridge.run(`
${DOC_PREAMBLE}
mesh_obj = doc.getObject(${JSON.stringify(meshName)})
if mesh_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(meshName)})
m = mesh_obj.Mesh.copy()
before = m.CountFacets
m.refine()
mesh_obj.Mesh = m
doc.recompute()
_mcp_result["result"] = {
    "name": mesh_obj.Name,
    "facets_before": before,
    "facets_after": m.CountFacets,
    "maxEdgeLength": ${maxEdgeLength}
}
`);
    }

    case 'freecad_mesh_info': {
      const meshName = args.meshName as string;
      return bridge.run(`
${DOC_PREAMBLE}
mesh_obj = doc.getObject(${JSON.stringify(meshName)})
if mesh_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(meshName)})
m = mesh_obj.Mesh
bb = m.BoundBox
_mcp_result["result"] = {
    "name": mesh_obj.Name,
    "vertices": m.CountPoints,
    "facets": m.CountFacets,
    "edges": m.CountEdges,
    "area": m.Area,
    "volume": m.Volume,
    "isSolid": m.isSolid(),
    "hasNonManifolds": m.hasNonManifolds(),
    "hasSelfIntersections": m.hasSelfIntersections(),
    "boundingBox": {
        "xMin": bb.XMin, "yMin": bb.YMin, "zMin": bb.ZMin,
        "xMax": bb.XMax, "yMax": bb.YMax, "zMax": bb.ZMax,
        "xLength": bb.XLength, "yLength": bb.YLength, "zLength": bb.ZLength,
    }
}
`);
    }

    case 'freecad_mesh_boolean': {
      const mesh1Name = args.mesh1Name as string;
      const mesh2Name = args.mesh2Name as string;
      const operation = args.operation as string;
      const resultName = (args.name as string) || 'MeshBool';
      const opMap: Record<string, string> = {
        union: 'unite',
        intersection: 'intersect',
        difference: 'difference',
      };
      const opMethod = opMap[operation] || 'unite';
      return bridge.run(`
${DOC_PREAMBLE}
import Mesh
m1_obj = doc.getObject(${JSON.stringify(mesh1Name)})
m2_obj = doc.getObject(${JSON.stringify(mesh2Name)})
if m1_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(mesh1Name)})
if m2_obj is None:
    raise ValueError("Mesh not found: " + ${JSON.stringify(mesh2Name)})
m1 = m1_obj.Mesh.copy()
m2 = m2_obj.Mesh.copy()
result = Mesh.Mesh()
result.addMesh(m1)
result.${opMethod}(m2)
result_obj = doc.addObject("Mesh::Feature", ${JSON.stringify(resultName)})
result_obj.Mesh = result
doc.recompute()
_mcp_result["result"] = {"name": result_obj.Name, "operation": ${JSON.stringify(operation)}, "facets": result.CountFacets}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown mesh tool: ${name}` }],
        isError: true,
      };
  }
}

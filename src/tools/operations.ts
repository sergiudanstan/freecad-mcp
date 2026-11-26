import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validatePositiveNumber, validateNumber } from '../validation.js';

export const OPERATION_TOOLS = [
  {
    name: 'freecad_boolean_fuse',
    description: 'Boolean union (fuse) of two objects into one',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Name of the first object' },
        object2: { type: 'string', description: 'Name of the second object' },
        name: { type: 'string', description: 'Name for the resulting fused object' },
      },
      required: ['object1', 'object2'],
    },
  },
  {
    name: 'freecad_boolean_cut',
    description: 'Boolean subtraction: cut object2 from object1',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Base object to cut from' },
        object2: { type: 'string', description: 'Tool object to subtract' },
        name: { type: 'string', description: 'Name for the resulting cut object' },
      },
      required: ['object1', 'object2'],
    },
  },
  {
    name: 'freecad_boolean_intersect',
    description: 'Boolean intersection of two objects (common volume)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Name of the first object' },
        object2: { type: 'string', description: 'Name of the second object' },
        name: { type: 'string', description: 'Name for the resulting intersection object' },
      },
      required: ['object1', 'object2'],
    },
  },
  {
    name: 'freecad_fillet',
    description: 'Apply fillet (rounded edges) to an object',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to fillet' },
        radius: { type: 'number', description: 'Fillet radius' },
        edgeIndices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Edge indices to fillet (1-based). All edges if omitted.',
        },
      },
      required: ['objectName', 'radius'],
    },
  },
  {
    name: 'freecad_chamfer',
    description: 'Apply chamfer (beveled edges) to an object',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to chamfer' },
        distance: { type: 'number', description: 'Chamfer distance' },
        edgeIndices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Edge indices to chamfer (1-based). All edges if omitted.',
        },
      },
      required: ['objectName', 'distance'],
    },
  },
  {
    name: 'freecad_move_object',
    description: 'Translate (move) an object to a new position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to move' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        z: { type: 'number', description: 'Z position' },
      },
      required: ['objectName', 'x', 'y', 'z'],
    },
  },
  {
    name: 'freecad_rotate_object',
    description: 'Rotate an object around an axis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to rotate' },
        axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Rotation axis' },
        angle: { type: 'number', description: 'Rotation angle in degrees' },
      },
      required: ['objectName', 'axis', 'angle'],
    },
  },
  {
    name: 'freecad_copy_object',
    description: 'Duplicate an object in the document',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to copy' },
        newName: { type: 'string', description: 'Name for the copy' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_delete_object',
    description: 'Remove an object from the document',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to delete' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_mirror_object',
    description: 'Mirror an object across a plane',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to mirror' },
        plane: { type: 'string', enum: ['XY', 'XZ', 'YZ'], description: 'Mirror plane' },
        name: { type: 'string', description: 'Name for the mirrored object' },
      },
      required: ['objectName', 'plane'],
    },
  },
  {
    name: 'freecad_check_geometry',
    description: 'Validate an object\'s geometry — check for shape errors (self-intersections, open shells, invalid faces, etc.)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to check' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_refine_shape',
    description: 'Remove redundant edges and faces from boolean operation results (clean up artifacts)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to refine' },
        name: { type: 'string', description: 'Name for the refined object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_boolean_fragments',
    description: 'Split overlapping shapes into all distinct non-overlapping fragments (generalized boolean)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to fragment',
        },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['objectNames'],
    },
  },
  {
    name: 'freecad_slice',
    description: 'Slice an object using another object as a cutting tool (splits into two or more pieces)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseName: { type: 'string', description: 'Name of the object to slice' },
        toolName: { type: 'string', description: 'Name of the cutting tool object' },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['baseName', 'toolName'],
    },
  },
  {
    name: 'freecad_boolean_xor',
    description: 'Boolean XOR: keep only the non-overlapping parts of two objects (exclusive OR)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Name of the first object' },
        object2: { type: 'string', description: 'Name of the second object' },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['object1', 'object2'],
    },
  },
  {
    name: 'freecad_join_connect',
    description: 'Connect walled objects (e.g., two pipes meeting) — creates a smooth connection between hollow shapes',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Name of the first walled object' },
        object2: { type: 'string', description: 'Name of the second walled object' },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['object1', 'object2'],
    },
  },
  {
    name: 'freecad_join_cutout',
    description: 'Create a cutout in a walled object for another object to pass through (e.g., pipe through wall)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        object1: { type: 'string', description: 'Name of the object to cut into (e.g., wall)' },
        object2: { type: 'string', description: 'Name of the object that passes through' },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['object1', 'object2'],
    },
  },
];

export async function handleOperationTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  switch (name) {
    case 'freecad_boolean_fuse': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const fuseName = (args.name as string) || 'Fuse';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
o1 = doc.getObject(${JSON.stringify(obj1)})
o2 = doc.getObject(${JSON.stringify(obj2)})
if o1 is None:
    raise ValueError("Object not found: ${obj1}")
if o2 is None:
    raise ValueError("Object not found: ${obj2}")
fuse = doc.addObject("Part::Fuse", ${JSON.stringify(fuseName)})
fuse.Base, fuse.Tool = o1, o2
doc.recompute()
_mcp_result["result"] = {"name": fuse.Name, "volume": fuse.Shape.Volume}
`);
    }

    case 'freecad_boolean_cut': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const cutName = (args.name as string) || 'Cut';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
o1 = doc.getObject(${JSON.stringify(obj1)})
o2 = doc.getObject(${JSON.stringify(obj2)})
if o1 is None:
    raise ValueError("Object not found: ${obj1}")
if o2 is None:
    raise ValueError("Object not found: ${obj2}")
cut = doc.addObject("Part::Cut", ${JSON.stringify(cutName)})
cut.Base = o1
cut.Tool = o2
doc.recompute()
_mcp_result["result"] = {"name": cut.Name, "volume": cut.Shape.Volume}
`);
    }

    case 'freecad_boolean_intersect': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const intName = (args.name as string) || 'Common';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
o1 = doc.getObject(${JSON.stringify(obj1)})
o2 = doc.getObject(${JSON.stringify(obj2)})
if o1 is None:
    raise ValueError("Object not found: ${obj1}")
if o2 is None:
    raise ValueError("Object not found: ${obj2}")
common = doc.addObject("Part::Common", ${JSON.stringify(intName)})
common.Base, common.Tool = o1, o2
doc.recompute()
_mcp_result["result"] = {"name": common.Name, "volume": common.Shape.Volume}
`);
    }

    case 'freecad_fillet': {
      const objectName = args.objectName as string;
      const radius = validatePositiveNumber(args.radius, 'radius');
      const edgeIndices = args.edgeIndices as number[] | undefined;
      const edgesPython = edgeIndices
        ? `[${edgeIndices.map(i => `(${i}, ${radius}, ${radius})`).join(', ')}]`
        : `[(i, ${radius}, ${radius}) for i in range(1, len(obj.Shape.Edges) + 1)]`;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
edges = ${edgesPython}
fillet = doc.addObject("Part::Fillet", "Fillet")
fillet.Base = obj
fillet.Shape = obj.Shape.makeFillet(${radius}, [obj.Shape.Edges[e[0]-1] for e in edges])
doc.recompute()
_mcp_result["result"] = {"name": fillet.Name, "edges": len(edges)}
`);
    }

    case 'freecad_chamfer': {
      const objectName = args.objectName as string;
      const distance = validatePositiveNumber(args.distance, 'distance');
      const edgeIndices = args.edgeIndices as number[] | undefined;
      const edgesPython = edgeIndices
        ? `[${edgeIndices.map(i => `(${i}, ${distance}, ${distance})`).join(', ')}]`
        : `[(i, ${distance}, ${distance}) for i in range(1, len(obj.Shape.Edges) + 1)]`;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
edges = ${edgesPython}
chamfer = doc.addObject("Part::Chamfer", "Chamfer")
chamfer.Base = obj
chamfer.Shape = obj.Shape.makeChamfer(${distance}, [obj.Shape.Edges[e[0]-1] for e in edges])
doc.recompute()
_mcp_result["result"] = {"name": chamfer.Name, "edges": len(edges)}
`);
    }

    case 'freecad_move_object': {
      const objectName = args.objectName as string;
      const x = args.x as number;
      const y = args.y as number;
      const z = args.z as number;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
obj.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
doc.recompute()
_mcp_result["result"] = {"name": obj.Name, "position": {"x": ${x}, "y": ${y}, "z": ${z}}}
`);
    }

    case 'freecad_rotate_object': {
      const objectName = args.objectName as string;
      const axis = args.axis as string;
      const angle = args.angle as number;
      const axisMap: Record<string, string> = {
        x: 'FreeCAD.Vector(1, 0, 0)',
        y: 'FreeCAD.Vector(0, 1, 0)',
        z: 'FreeCAD.Vector(0, 0, 1)',
      };
      const axisVec = axisMap[axis] || 'FreeCAD.Vector(0, 0, 1)';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
rot = FreeCAD.Rotation(${axisVec}, ${angle})
obj.Placement.Rotation = rot
doc.recompute()
_mcp_result["result"] = {"name": obj.Name, "axis": ${JSON.stringify(axis)}, "angle": ${angle}}
`);
    }

    case 'freecad_copy_object': {
      const objectName = args.objectName as string;
      const newName = args.newName as string | undefined;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
copy = doc.copyObject(obj)
${newName ? `copy.Label = ${JSON.stringify(newName)}` : ''}
doc.recompute()
_mcp_result["result"] = {"name": copy.Name, "label": copy.Label}
`);
    }

    case 'freecad_delete_object': {
      const objectName = args.objectName as string;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
doc.removeObject(${JSON.stringify(objectName)})
doc.recompute()
_mcp_result["result"] = {"deleted": ${JSON.stringify(objectName)}}
`);
    }

    case 'freecad_mirror_object': {
      const objectName = args.objectName as string;
      const plane = args.plane as string;
      const mirrorName = (args.name as string) || 'Mirror';
      const planeMap: Record<string, { point: string; normal: string }> = {
        XY: { point: 'FreeCAD.Vector(0, 0, 0)', normal: 'FreeCAD.Vector(0, 0, 1)' },
        XZ: { point: 'FreeCAD.Vector(0, 0, 0)', normal: 'FreeCAD.Vector(0, 1, 0)' },
        YZ: { point: 'FreeCAD.Vector(0, 0, 0)', normal: 'FreeCAD.Vector(1, 0, 0)' },
      };
      const { point, normal } = planeMap[plane] || planeMap.XY;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
mirrored_shape = obj.Shape.mirror(${point}, ${normal})
mirror_obj = doc.addObject("Part::Feature", ${JSON.stringify(mirrorName)})
mirror_obj.Shape = mirrored_shape
doc.recompute()
_mcp_result["result"] = {"name": mirror_obj.Name, "plane": ${JSON.stringify(plane)}}
`);
    }

    case 'freecad_check_geometry': {
      const objectName = args.objectName as string;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
shape = obj.Shape
is_valid = shape.isValid()
is_closed = shape.isClosed() if hasattr(shape, 'isClosed') else None
checks = {
    "isValid": is_valid,
    "isClosed": is_closed,
    "faces": len(shape.Faces),
    "edges": len(shape.Edges),
    "vertices": len(shape.Vertexes),
    "shells": len(shape.Shells),
    "solids": len(shape.Solids),
    "shapeType": shape.ShapeType,
}
errors = []
try:
    shape.check()
except Exception as e:
    errors.append(str(e))
checks["errors"] = errors
_mcp_result["result"] = checks
`);
    }

    case 'freecad_refine_shape': {
      const objectName = args.objectName as string;
      const refinedName = (args.name as string) || 'Refined';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
refined_shape = obj.Shape.removeSplitter()
result = doc.addObject("Part::Feature", ${JSON.stringify(refinedName)})
result.Shape = refined_shape
doc.recompute()
_mcp_result["result"] = {"name": result.Name, "faces_before": len(obj.Shape.Faces), "faces_after": len(refined_shape.Faces), "edges_before": len(obj.Shape.Edges), "edges_after": len(refined_shape.Edges)}
`);
    }

    case 'freecad_boolean_fragments': {
      const objectNames = args.objectNames as string[];
      const bfName = (args.name as string) || 'BooleanFragments';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
import BOPTools.SplitFeatures
bf = BOPTools.SplitFeatures.makeBooleanFragments(${JSON.stringify(bfName)})
bf.Objects = [doc.getObject(n) for n in ${JSON.stringify(objectNames)}]
bf.Mode = "Standard"
doc.recompute()
pieces = len(bf.Shape.Solids) if bf.Shape.Solids else len(bf.Shape.Faces)
_mcp_result["result"] = {"name": bf.Name, "inputObjects": ${JSON.stringify(objectNames)}, "fragments": pieces}
`);
    }

    case 'freecad_slice': {
      const baseName = args.baseName as string;
      const toolName = args.toolName as string;
      const sliceName = (args.name as string) || 'Slice';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
import BOPTools.SplitFeatures
sl = BOPTools.SplitFeatures.makeSlice(${JSON.stringify(sliceName)})
sl.Base = doc.getObject(${JSON.stringify(baseName)})
sl.Tools = [doc.getObject(${JSON.stringify(toolName)})]
sl.Mode = "Standard"
doc.recompute()
pieces = len(sl.Shape.Solids) if sl.Shape.Solids else len(sl.Shape.Faces)
_mcp_result["result"] = {"name": sl.Name, "base": ${JSON.stringify(baseName)}, "tool": ${JSON.stringify(toolName)}, "pieces": pieces}
`);
    }

    case 'freecad_boolean_xor': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const xorName = (args.name as string) || 'XOR';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
import BOPTools.SplitFeatures
xor = BOPTools.SplitFeatures.makeXOR(${JSON.stringify(xorName)})
xor.Objects = [doc.getObject(${JSON.stringify(obj1)}), doc.getObject(${JSON.stringify(obj2)})]
doc.recompute()
_mcp_result["result"] = {"name": xor.Name, "volume": xor.Shape.Volume}
`);
    }

    case 'freecad_join_connect': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const joinName = (args.name as string) || 'JoinConnect';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
from BOPTools import JoinFeatures
members = [doc.getObject(n) for n in (${JSON.stringify(obj1)}, ${JSON.stringify(obj2)})]
if None in members:
    raise ValueError("Object not found")
j = JoinFeatures.makeConnect(${JSON.stringify(joinName)})
j.Objects = members
doc.recompute()
_mcp_result["result"] = {"name": j.Name, "volume": j.Shape.Volume}
`);
    }

    case 'freecad_join_cutout': {
      const obj1 = args.object1 as string;
      const obj2 = args.object2 as string;
      const joinName = (args.name as string) || 'JoinCutout';
      return bridge.run(`
doc = FreeCAD.ActiveDocument
from BOPTools import JoinFeatures
j = JoinFeatures.makeCutout(${JSON.stringify(joinName)})
j.Base, j.Tool = doc.getObject(${JSON.stringify(obj1)}), doc.getObject(${JSON.stringify(obj2)})
if j.Base is None or j.Tool is None:
    raise ValueError("Object not found")
doc.recompute()
_mcp_result["result"] = {"name": j.Name, "volume": j.Shape.Volume}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown operation tool: ${name}` }],
        isError: true,
      };
  }
}

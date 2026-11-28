import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { pyBool, validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const ADVANCED_OPERATION_TOOLS = [
  {
    name: 'freecad_thickness',
    description: 'Hollow out a solid by offsetting faces inward (shell operation). Removes selected faces and offsets the rest.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the solid object to hollow' },
        thickness: { type: 'number', description: 'Wall thickness in mm' },
        faceNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Faces to remove (e.g. ["Face1"]). These become the openings.',
        },
        name: { type: 'string', description: 'Name for the result' },
      },
      required: ['objectName', 'thickness', 'faceNames'],
    },
  },
  {
    name: 'freecad_offset_3d',
    description: 'Create a 3D offset surface/solid (inflate or deflate a shape)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to offset' },
        distance: { type: 'number', description: 'Offset distance in mm (positive = outward, negative = inward)' },
        name: { type: 'string', description: 'Name for the offset object' },
      },
      required: ['objectName', 'distance'],
    },
  },
  {
    name: 'freecad_section',
    description: 'Create a cross-section of an object with a plane',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to section' },
        plane: {
          type: 'string',
          enum: ['XY', 'XZ', 'YZ'],
          description: 'Section plane (default: XY)',
        },
        offset: { type: 'number', description: 'Offset of the section plane from origin in mm (default 0)' },
        name: { type: 'string', description: 'Name for the section object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_compound',
    description: 'Create a compound (group) from multiple objects without fusing them',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to include in the compound',
        },
        name: { type: 'string', description: 'Name for the compound' },
      },
      required: ['objectNames'],
    },
  },
  {
    name: 'freecad_linear_array',
    description: 'Create a linear array (copies of an object spaced along a direction)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to array' },
        directionX: { type: 'number', description: 'X component of spacing direction' },
        directionY: { type: 'number', description: 'Y component of spacing direction' },
        directionZ: { type: 'number', description: 'Z component of spacing direction' },
        count: { type: 'number', description: 'Number of copies (including original)' },
        name: { type: 'string', description: 'Name for the array' },
      },
      required: ['objectName', 'directionX', 'directionY', 'directionZ', 'count'],
    },
  },
  {
    name: 'freecad_polar_array',
    description: 'Create a polar (circular) array of copies around an axis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to array' },
        count: { type: 'number', description: 'Number of copies (including original)' },
        angle: { type: 'number', description: 'Total angle to span in degrees (default 360)' },
        axisX: { type: 'number', description: 'X component of rotation axis (default 0)' },
        axisY: { type: 'number', description: 'Y component of rotation axis (default 0)' },
        axisZ: { type: 'number', description: 'Z component of rotation axis (default 1)' },
        centerX: { type: 'number', description: 'X of rotation center (default 0)' },
        centerY: { type: 'number', description: 'Y of rotation center (default 0)' },
        centerZ: { type: 'number', description: 'Z of rotation center (default 0)' },
        name: { type: 'string', description: 'Name for the array' },
      },
      required: ['objectName', 'count'],
    },
  },
  {
    name: 'freecad_scale_object',
    description: 'Scale an object uniformly or non-uniformly',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to scale' },
        scaleX: { type: 'number', description: 'Scale factor in X (default 1.0)' },
        scaleY: { type: 'number', description: 'Scale factor in Y (default same as scaleX)' },
        scaleZ: { type: 'number', description: 'Scale factor in Z (default same as scaleX)' },
        name: { type: 'string', description: 'Name for the scaled object' },
      },
      required: ['objectName', 'scaleX'],
    },
  },
  {
    name: 'freecad_extrude',
    description: 'Extrude a 2D wire/face along a direction to create a 3D solid (Part Extrude, not PartDesign Pad)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the 2D shape/wire to extrude' },
        dirX: { type: 'number', description: 'X component of extrusion direction (default 0)' },
        dirY: { type: 'number', description: 'Y component of extrusion direction (default 0)' },
        dirZ: { type: 'number', description: 'Z component of extrusion direction (default 10)' },
        solid: { type: 'boolean', description: 'Create a solid (default true)' },
        name: { type: 'string', description: 'Name for the extruded object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_get_center_of_mass',
    description: 'Get the center of mass and inertia properties of an object',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_get_face_info',
    description: 'Get information about faces of an object (type, area, normal, center)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
        faceIndex: { type: 'number', description: 'Specific face index (1-based). If omitted, returns info for all faces.' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_get_edge_info',
    description: 'Get information about edges of an object (type, length, start/end points)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
        edgeIndex: { type: 'number', description: 'Specific edge index (1-based). If omitted, returns info for all edges.' },
      },
      required: ['objectName'],
    },
  },
];

export async function handleAdvancedOperationTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(ADVANCED_OPERATION_TOOLS, name, args);
  switch (name) {
    case 'freecad_thickness': {
      const objectName = args.objectName as string;
      const thickness = args.thickness as number;
      const faceNames = args.faceNames as string[];
      const resultName = (args.name as string) || 'Thickness';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
faces = [getattr(obj.Shape, f) for f in ${JSON.stringify(faceNames)}]
shell_shape = obj.Shape.makeThickness(faces, ${thickness}, 1e-3)
result = doc.addObject("Part::Feature", ${JSON.stringify(resultName)})
result.Shape = shell_shape
doc.recompute()
_mcp_result["result"] = {"name": result.Name, "thickness": ${thickness}, "removedFaces": ${JSON.stringify(faceNames)}, "volume": result.Shape.Volume}
`);
    }

    case 'freecad_offset_3d': {
      const objectName = args.objectName as string;
      const distance = args.distance as number;
      const resultName = (args.name as string) || 'Offset3D';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
offset_shape = obj.Shape.makeOffsetShape(${distance}, 1e-3, fill=True)
result = doc.addObject("Part::Feature", ${JSON.stringify(resultName)})
result.Shape = offset_shape
doc.recompute()
_mcp_result["result"] = {"name": result.Name, "offset": ${distance}, "volume": result.Shape.Volume}
`);
    }

    case 'freecad_section': {
      const objectName = args.objectName as string;
      const plane = (args.plane as string) || 'XY';
      const offset = (args.offset as number) ?? 0;
      const resultName = (args.name as string) || 'Section';
      const planeMap: Record<string, { base: string; normal: string }> = {
        XY: { base: `FreeCAD.Vector(0, 0, ${offset})`, normal: 'FreeCAD.Vector(0, 0, 1)' },
        XZ: { base: `FreeCAD.Vector(0, ${offset}, 0)`, normal: 'FreeCAD.Vector(0, 1, 0)' },
        YZ: { base: `FreeCAD.Vector(${offset}, 0, 0)`, normal: 'FreeCAD.Vector(1, 0, 0)' },
      };
      const { base, normal } = planeMap[plane] || planeMap['XY'];
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
section_shape = obj.Shape.section(Part.makePlane(1000, 1000, ${base}, ${normal}))
result = doc.addObject("Part::Feature", ${JSON.stringify(resultName)})
result.Shape = section_shape
doc.recompute()
edges = len(result.Shape.Edges)
_mcp_result["result"] = {"name": result.Name, "plane": ${JSON.stringify(plane)}, "offset": ${offset}, "edges": edges}
`);
    }

    case 'freecad_compound': {
      const objectNames = args.objectNames as string[];
      const compName = (args.name as string) || 'Compound';
      return bridge.run(`
${DOC_PREAMBLE}
obj_names = ${JSON.stringify(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
comp = doc.addObject("Part::Compound", ${JSON.stringify(compName)})
comp.Links = objs
doc.recompute()
_mcp_result["result"] = {"name": comp.Name, "objects": obj_names, "count": len(obj_names)}
`);
    }

    case 'freecad_linear_array': {
      const objectName = args.objectName as string;
      const dx = args.directionX as number;
      const dy = args.directionY as number;
      const dz = args.directionZ as number;
      const count = args.count as number;
      const arrName = (args.name as string) || 'LinearArray';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
arr = Draft.make_ortho_array(obj, v_x=FreeCAD.Vector(${dx}, ${dy}, ${dz}), n_x=${count}, n_y=1, n_z=1)
arr.Label = ${JSON.stringify(arrName)}
doc.recompute()
_mcp_result["result"] = {"name": arr.Name, "label": arr.Label, "count": ${count}, "spacing": {"x": ${dx}, "y": ${dy}, "z": ${dz}}}
`);
    }

    case 'freecad_polar_array': {
      const objectName = args.objectName as string;
      const count = args.count as number;
      const angle = (args.angle as number) ?? 360;
      const axisX = (args.axisX as number) ?? 0;
      const axisY = (args.axisY as number) ?? 0;
      const axisZ = (args.axisZ as number) ?? 1;
      const centerX = (args.centerX as number) ?? 0;
      const centerY = (args.centerY as number) ?? 0;
      const centerZ = (args.centerZ as number) ?? 0;
      const arrName = (args.name as string) || 'PolarArray';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
arr = Draft.make_polar_array(obj, ${count}, ${angle}, FreeCAD.Vector(${centerX}, ${centerY}, ${centerZ}), FreeCAD.Vector(${axisX}, ${axisY}, ${axisZ}))
arr.Label = ${JSON.stringify(arrName)}
doc.recompute()
_mcp_result["result"] = {"name": arr.Name, "label": arr.Label, "count": ${count}, "angle": ${angle}}
`);
    }

    case 'freecad_scale_object': {
      const objectName = args.objectName as string;
      const scaleX = args.scaleX as number;
      const scaleY = (args.scaleY as number) ?? scaleX;
      const scaleZ = (args.scaleZ as number) ?? scaleX;
      const resultName = (args.name as string) || 'Scaled';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
import FreeCAD
mat = FreeCAD.Matrix()
mat.scale(${scaleX}, ${scaleY}, ${scaleZ})
scaled_shape = obj.Shape.transformGeometry(mat)
result = doc.addObject("Part::Feature", ${JSON.stringify(resultName)})
result.Shape = scaled_shape
doc.recompute()
_mcp_result["result"] = {"name": result.Name, "scale": {"x": ${scaleX}, "y": ${scaleY}, "z": ${scaleZ}}, "volume": result.Shape.Volume}
`);
    }

    case 'freecad_extrude': {
      const objectName = args.objectName as string;
      const dirX = (args.dirX as number) ?? 0;
      const dirY = (args.dirY as number) ?? 0;
      const dirZ = (args.dirZ as number) ?? 10;
      const solid = (args.solid as boolean) ?? true;
      const resultName = (args.name as string) || 'Extrude';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
ext = doc.addObject("Part::Extrusion", ${JSON.stringify(resultName)})
ext.Base = obj
ext.Dir = FreeCAD.Vector(${dirX}, ${dirY}, ${dirZ})
ext.Solid = ${pyBool(solid)}
doc.recompute()
_mcp_result["result"] = {"name": ext.Name, "direction": {"x": ${dirX}, "y": ${dirY}, "z": ${dirZ}}, "solid": ext.Solid, "volume": ext.Shape.Volume}
`);
    }

    case 'freecad_get_center_of_mass': {
      const objectName = args.objectName as string;
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
com = obj.Shape.CenterOfGravity
sm = obj.Shape.MatrixOfInertia
_mcp_result["result"] = {
    "objectName": ${JSON.stringify(objectName)},
    "centerOfMass": {"x": com.x, "y": com.y, "z": com.z},
    "volume": obj.Shape.Volume,
    "area": obj.Shape.Area,
    "inertiaMatrix": {
        "Ixx": sm.A11, "Ixy": sm.A12, "Ixz": sm.A13,
        "Iyx": sm.A21, "Iyy": sm.A22, "Iyz": sm.A23,
        "Izx": sm.A31, "Izy": sm.A32, "Izz": sm.A33
    }
}
`);
    }

    case 'freecad_get_face_info': {
      const objectName = args.objectName as string;
      const faceIndex = args.faceIndex as number | undefined;
      if (faceIndex !== undefined) {
        return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
face = obj.Shape.Faces[${faceIndex} - 1]
com = face.CenterOfMass
normal = face.normalAt(0, 0)
_mcp_result["result"] = {
    "objectName": ${JSON.stringify(objectName)},
    "faceIndex": ${faceIndex},
    "faceName": "Face${faceIndex}",
    "type": face.Surface.__class__.__name__,
    "area": face.Area,
    "center": {"x": com.x, "y": com.y, "z": com.z},
    "normal": {"x": normal.x, "y": normal.y, "z": normal.z}
}
`);
      }
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
faces = []
for i, face in enumerate(obj.Shape.Faces):
    com = face.CenterOfMass
    normal = face.normalAt(0, 0)
    faces.append({
        "faceIndex": i + 1,
        "faceName": f"Face{i+1}",
        "type": face.Surface.__class__.__name__,
        "area": face.Area,
        "center": {"x": com.x, "y": com.y, "z": com.z},
        "normal": {"x": normal.x, "y": normal.y, "z": normal.z}
    })
_mcp_result["result"] = {"objectName": ${JSON.stringify(objectName)}, "faceCount": len(faces), "faces": faces}
`);
    }

    case 'freecad_get_edge_info': {
      const objectName = args.objectName as string;
      const edgeIndex = args.edgeIndex as number | undefined;
      if (edgeIndex !== undefined) {
        return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
edge = obj.Shape.Edges[${edgeIndex} - 1]
v1 = edge.Vertexes[0].Point if edge.Vertexes else FreeCAD.Vector(0,0,0)
v2 = edge.Vertexes[-1].Point if len(edge.Vertexes) > 1 else v1
_mcp_result["result"] = {
    "objectName": ${JSON.stringify(objectName)},
    "edgeIndex": ${edgeIndex},
    "edgeName": "Edge${edgeIndex}",
    "type": edge.Curve.__class__.__name__,
    "length": edge.Length,
    "start": {"x": v1.x, "y": v1.y, "z": v1.z},
    "end": {"x": v2.x, "y": v2.y, "z": v2.z}
}
`);
      }
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
edges = []
for i, edge in enumerate(obj.Shape.Edges):
    v1 = edge.Vertexes[0].Point if edge.Vertexes else FreeCAD.Vector(0,0,0)
    v2 = edge.Vertexes[-1].Point if len(edge.Vertexes) > 1 else v1
    edges.append({
        "edgeIndex": i + 1,
        "edgeName": f"Edge{i+1}",
        "type": edge.Curve.__class__.__name__,
        "length": edge.Length,
        "start": {"x": v1.x, "y": v1.y, "z": v1.z},
        "end": {"x": v2.x, "y": v2.y, "z": v2.z}
    })
_mcp_result["result"] = {"objectName": ${JSON.stringify(objectName)}, "edgeCount": len(edges), "edges": edges}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown advanced operation tool: ${name}` }],
        isError: true,
      };
  }
}

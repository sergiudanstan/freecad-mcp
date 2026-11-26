import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateFilePath, validateString, validateArray, escapePythonString } from '../validation.js';

export const IMPORT_EXPORT_TOOLS = [
  {
    name: 'freecad_import_step',
    description: 'Import a STEP file into a FreeCAD document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the STEP file' },
        documentName: { type: 'string', description: 'Optional document name to import into' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_import_stl',
    description: 'Import an STL file into a FreeCAD document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the STL file' },
        documentName: { type: 'string', description: 'Optional document name to import into' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_export_step',
    description: 'Export objects to a STEP file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output STEP file' },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_export_stl',
    description: 'Export objects to an STL file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output STL file' },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_export_obj',
    description: 'Export objects to an OBJ file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output OBJ file' },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_measure_distance',
    description: 'Measure the distance between two points or two object centers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        point1: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'First point (x, y, z)',
        },
        point2: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Second point (x, y, z)',
        },
        object1Name: { type: 'string', description: 'Name of first object (uses bounding box center)' },
        object2Name: { type: 'string', description: 'Name of second object (uses bounding box center)' },
      },
    },
  },
  {
    name: 'freecad_measure_angle',
    description: 'Measure the angle between two faces of an object.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
        face1: { type: 'string', description: 'First face reference (e.g. "Face1")' },
        face2: { type: 'string', description: 'Second face reference (e.g. "Face2")' },
      },
      required: ['objectName', 'face1', 'face2'],
    },
  },
  {
    name: 'freecad_get_volume',
    description: 'Get the volume of an object.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_get_bounding_box',
    description: 'Get the bounding box of an object.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object' },
      },
      required: ['objectName'],
    },
  },
  {
    name: 'freecad_execute_python',
    description: 'Execute arbitrary FreeCAD Python code. WARNING: This tool runs arbitrary Python code with full system access. Only use in trusted environments. The code runs in a context with FreeCAD and Part already imported. Set _mcp_result["result"] to return data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'Python code to execute in FreeCAD' },
      },
      required: ['code'],
    },
  },
  {
    name: 'freecad_import_iges',
    description: 'Import an IGES file into a FreeCAD document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the IGES file (.igs or .iges)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_import_dxf',
    description: 'Import a DXF file into a FreeCAD document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the DXF file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_import_svg',
    description: 'Import an SVG file into a FreeCAD document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the SVG file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_export_iges',
    description: 'Export objects to an IGES file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output IGES file' },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_export_dxf',
    description: 'Export objects to a DXF file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output DXF file' },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_export_svg',
    description: 'Export objects to an SVG file (projected 2D view).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to export',
        },
        filePath: { type: 'string', description: 'Absolute path for the output SVG file' },
        direction: {
          type: 'string',
          enum: ['Front', 'Top', 'Right', 'Isometric'],
          description: 'Projection direction (default: Front)',
        },
      },
      required: ['objectNames', 'filePath'],
    },
  },
  {
    name: 'freecad_export_brep',
    description: 'Export objects to BREP format (native OpenCASCADE boundary representation).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to export' },
        filePath: { type: 'string', description: 'Absolute path for the output BREP file' },
      },
      required: ['objectName', 'filePath'],
    },
  },
];

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

function escapeString(s: string): string {
  return escapePythonString(s);
}

function toJsonArray(arr: unknown[]): string {
  return JSON.stringify(arr);
}

export async function handleImportExportTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  switch (name) {
    case 'freecad_import_step': {
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const docName = args.documentName ? escapeString(validateString(args.documentName, 'documentName')) : null;
      const code = `
${DOC_PREAMBLE}
${docName ? `doc = FreeCAD.getDocument("${docName}") if "${docName}" in [d.Name for d in FreeCAD.listDocuments().values()] else doc` : ''}
Part.insert("${filePath}", doc.Name)
doc.recompute()
_mcp_result["result"] = {"document": doc.Name, "objects": [o.Name for o in doc.Objects]}
`;
      return bridge.run(code);
    }

    case 'freecad_import_stl': {
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const docName = args.documentName ? escapeString(validateString(args.documentName, 'documentName')) : null;
      const code = `
${DOC_PREAMBLE}
${docName ? `doc = FreeCAD.getDocument("${docName}") if "${docName}" in [d.Name for d in FreeCAD.listDocuments().values()] else doc` : ''}
import Mesh
Mesh.insert("${filePath}", doc.Name)
doc.recompute()
_mcp_result["result"] = {"document": doc.Name, "objects": [o.Name for o in doc.Objects]}
`;
      return bridge.run(code);
    }

    case 'freecad_export_step': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const code = `
${DOC_PREAMBLE}
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
Part.export(objs, "${filePath}")
import os
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}", "size_bytes": os.path.getsize("${filePath}")}
`;
      return bridge.run(code);
    }

    case 'freecad_export_stl': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const code = `
${DOC_PREAMBLE}
import Mesh
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
shapes = [o.Shape for o in objs]
mesh = Mesh.Mesh()
for s in shapes:
    mesh.addFacets(s.tessellate(0.1))
mesh.write("${filePath}")
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}"}
`;
      return bridge.run(code);
    }

    case 'freecad_export_obj': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const code = `
${DOC_PREAMBLE}
import Mesh
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
shapes = [o.Shape for o in objs]
mesh = Mesh.Mesh()
for s in shapes:
    mesh.addFacets(s.tessellate(0.1))
mesh.write("${filePath}")
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}"}
`;
      return bridge.run(code);
    }

    case 'freecad_measure_distance': {
      const point1 = args.point1 as { x: number; y: number; z: number } | undefined;
      const point2 = args.point2 as { x: number; y: number; z: number } | undefined;
      const obj1 = args.object1Name as string | undefined;
      const obj2 = args.object2Name as string | undefined;

      let p1Code: string;
      let p2Code: string;

      if (point1) {
        p1Code = `FreeCAD.Vector(${point1.x}, ${point1.y}, ${point1.z})`;
      } else if (obj1) {
        p1Code = `doc.getObject("${escapeString(obj1)}").Shape.BoundBox.Center`;
      } else {
        return {
          content: [{ type: 'text', text: 'Must provide either point1 or object1Name' }],
          isError: true,
        };
      }

      if (point2) {
        p2Code = `FreeCAD.Vector(${point2.x}, ${point2.y}, ${point2.z})`;
      } else if (obj2) {
        p2Code = `doc.getObject("${escapeString(obj2)}").Shape.BoundBox.Center`;
      } else {
        return {
          content: [{ type: 'text', text: 'Must provide either point2 or object2Name' }],
          isError: true,
        };
      }

      const code = `
${DOC_PREAMBLE}
p1 = ${p1Code}
p2 = ${p2Code}
diff = p2.sub(p1)
distance = diff.Length
_mcp_result["result"] = {
    "distance": distance,
    "point1": {"x": p1.x, "y": p1.y, "z": p1.z},
    "point2": {"x": p2.x, "y": p2.y, "z": p2.z},
    "delta": {"x": diff.x, "y": diff.y, "z": diff.z}
}
`;
      return bridge.run(code);
    }

    case 'freecad_measure_angle': {
      const objectName = escapeString(args.objectName as string);
      const face1 = escapeString(args.face1 as string);
      const face2 = escapeString(args.face2 as string);
      const code = `
${DOC_PREAMBLE}
import math
obj = doc.getObject("${objectName}")
if obj is None:
    raise ValueError("Object '${objectName}' not found")
shape = obj.Shape
f1 = getattr(shape, "${face1}")
f2 = getattr(shape, "${face2}")
n1 = f1.normalAt(0, 0)
n2 = f2.normalAt(0, 0)
dot = n1.dot(n2)
dot = max(-1.0, min(1.0, dot))
angle_rad = math.acos(dot)
angle_deg = math.degrees(angle_rad)
_mcp_result["result"] = {
    "angle_degrees": angle_deg,
    "angle_radians": angle_rad,
    "normal1": {"x": n1.x, "y": n1.y, "z": n1.z},
    "normal2": {"x": n2.x, "y": n2.y, "z": n2.z}
}
`;
      return bridge.run(code);
    }

    case 'freecad_get_volume': {
      const objectName = escapeString(args.objectName as string);
      const code = `
${DOC_PREAMBLE}
obj = doc.getObject("${objectName}")
if obj is None:
    raise ValueError("Object '${objectName}' not found")
vol = obj.Shape.Volume
area = obj.Shape.Area
_mcp_result["result"] = {"objectName": "${objectName}", "volume_mm3": vol, "area_mm2": area}
`;
      return bridge.run(code);
    }

    case 'freecad_get_bounding_box': {
      const objectName = escapeString(args.objectName as string);
      const code = `
${DOC_PREAMBLE}
obj = doc.getObject("${objectName}")
if obj is None:
    raise ValueError("Object '${objectName}' not found")
bb = obj.Shape.BoundBox
_mcp_result["result"] = {
    "objectName": "${objectName}",
    "xMin": bb.XMin, "yMin": bb.YMin, "zMin": bb.ZMin,
    "xMax": bb.XMax, "yMax": bb.YMax, "zMax": bb.ZMax,
    "xLength": bb.XLength, "yLength": bb.YLength, "zLength": bb.ZLength,
    "center": {"x": bb.Center.x, "y": bb.Center.y, "z": bb.Center.z}
}
`;
      return bridge.run(code);
    }

    case 'freecad_execute_python': {
      const code = args.code as string;
      return bridge.run(`
${DOC_PREAMBLE}
${code}
`);
    }

    case 'freecad_import_iges': {
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
Part.insert("${filePath}", doc.Name)
doc.recompute()
_mcp_result["result"] = {"document": doc.Name, "objects": [o.Name for o in doc.Objects], "file": "${filePath}"}
`);
    }

    case 'freecad_import_dxf': {
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
import importDXF
importDXF.insert("${filePath}", doc.Name)
doc.recompute()
_mcp_result["result"] = {"document": doc.Name, "objects": [o.Name for o in doc.Objects], "file": "${filePath}"}
`);
    }

    case 'freecad_import_svg': {
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
import importSVG
importSVG.insert("${filePath}", doc.Name)
doc.recompute()
_mcp_result["result"] = {"document": doc.Name, "objects": [o.Name for o in doc.Objects], "file": "${filePath}"}
`);
    }

    case 'freecad_export_iges': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
Part.export(objs, "${filePath}")
import os
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}", "size_bytes": os.path.getsize("${filePath}")}
`);
    }

    case 'freecad_export_dxf': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
import importDXF
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
importDXF.export(objs, "${filePath}")
import os
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}", "size_bytes": os.path.getsize("${filePath}")}
`);
    }

    case 'freecad_export_svg': {
      const objectNames = validateArray(args.objectNames, 'objectNames') as string[];
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      const direction = (args.direction as string) || 'Front';
      const dirMap: Record<string, string> = {
        Front: 'FreeCAD.Vector(0, 0, -1)',
        Top: 'FreeCAD.Vector(0, -1, 0)',
        Right: 'FreeCAD.Vector(1, 0, 0)',
        Isometric: 'FreeCAD.Vector(1, 1, 1)',
      };
      const dirVec = dirMap[direction] || dirMap['Front'];
      return bridge.run(`
${DOC_PREAMBLE}
import importSVG
obj_names = ${toJsonArray(objectNames)}
objs = [doc.getObject(n) for n in obj_names]
missing = [n for n, o in zip(obj_names, objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
importSVG.export(objs, "${filePath}")
import os
_mcp_result["result"] = {"exported": obj_names, "filePath": "${filePath}", "size_bytes": os.path.getsize("${filePath}")}
`);
    }

    case 'freecad_export_brep': {
      const objectName = args.objectName as string;
      const filePath = escapeString(validateFilePath(args.filePath, 'filePath'));
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
obj.Shape.exportBrep("${filePath}")
import os
_mcp_result["result"] = {"exported": ${JSON.stringify(objectName)}, "filePath": "${filePath}", "size_bytes": os.path.getsize("${filePath}")}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown import/export tool: ${name}` }],
        isError: true,
      };
  }
}

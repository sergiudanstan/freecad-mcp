import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateToolArgs } from '../validation.js';

export const DOCUMENT_TOOLS = [
  {
    name: 'freecad_new_document',
    description: 'Create a new FreeCAD document',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the new document' },
      },
      required: ['name'],
    },
  },
  {
    name: 'freecad_open_document',
    description: 'Open an existing FreeCAD .FCStd file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Path to the .FCStd file to open' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'freecad_save_document',
    description: 'Save the active document. Optionally save to a new file path.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Optional file path for save-as' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_close_document',
    description: 'Close a FreeCAD document by name',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the document to close' },
      },
      required: ['name'],
    },
  },
  {
    name: 'freecad_list_objects',
    description: 'List all objects in a FreeCAD document',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documentName: { type: 'string', description: 'Document name (uses active document if omitted)' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_get_object_info',
    description: 'Get detailed information about a specific object including shape volume, area, and bounding box',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to inspect' },
        documentName: { type: 'string', description: 'Document name (uses active document if omitted)' },
      },
      required: ['objectName'],
    },
  },
];

export async function handleDocumentTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(DOCUMENT_TOOLS, name, args);
  switch (name) {
    case 'freecad_new_document': {
      const docName = args.name as string;
      return bridge.run(`
doc = FreeCAD.newDocument(${JSON.stringify(docName)})
_mcp_result["result"] = {"name": doc.Name}
`);
    }

    case 'freecad_open_document': {
      const filePath = args.filePath as string;
      return bridge.run(`
doc = FreeCAD.openDocument(${JSON.stringify(filePath)})
_mcp_result["result"] = {"name": doc.Name, "objects": len(doc.Objects)}
`);
    }

    case 'freecad_save_document': {
      const filePath = args.filePath as string | undefined;
      if (filePath) {
        return bridge.run(`
doc = FreeCAD.ActiveDocument
doc.saveAs(${JSON.stringify(filePath)})
_mcp_result["result"] = {"saved": ${JSON.stringify(filePath)}}
`);
      }
      return bridge.run(`
doc = FreeCAD.ActiveDocument
doc.save()
_mcp_result["result"] = {"saved": doc.FileName}
`);
    }

    case 'freecad_close_document': {
      const docName = args.name as string;
      return bridge.run(`
FreeCAD.closeDocument(${JSON.stringify(docName)})
_mcp_result["result"] = {"closed": ${JSON.stringify(docName)}}
`);
    }

    case 'freecad_list_objects': {
      const docName = args.documentName as string | undefined;
      const getDoc = docName
        ? `doc = FreeCAD.getDocument(${JSON.stringify(docName)})`
        : `doc = FreeCAD.ActiveDocument`;
      return bridge.run(`
${getDoc}
objects = []
for obj in doc.Objects:
    objects.append({"name": obj.Name, "label": obj.Label, "typeName": obj.TypeId})
_mcp_result["result"] = {"document": doc.Name, "objects": objects}
`);
    }

    case 'freecad_get_object_info': {
      const objectName = args.objectName as string;
      const docName = args.documentName as string | undefined;
      const getDoc = docName
        ? `doc = FreeCAD.getDocument(${JSON.stringify(docName)})`
        : `doc = FreeCAD.ActiveDocument`;
      return bridge.run(`
${getDoc}
obj = doc.getObject(${JSON.stringify(objectName)})
info = {"name": obj.Name, "label": obj.Label, "typeName": obj.TypeId}
placement = obj.Placement
info["placement"] = {
    "position": {"x": placement.Base.x, "y": placement.Base.y, "z": placement.Base.z},
    "rotation": {"angle": placement.Rotation.Angle, "axis": {"x": placement.Rotation.Axis.x, "y": placement.Rotation.Axis.y, "z": placement.Rotation.Axis.z}}
}
if hasattr(obj, "Shape"):
    shape = obj.Shape
    bb = shape.BoundBox
    info["shape"] = {
        "volume": shape.Volume,
        "area": shape.Area,
        "boundingBox": {"xMin": bb.XMin, "yMin": bb.YMin, "zMin": bb.ZMin, "xMax": bb.XMax, "yMax": bb.YMax, "zMax": bb.ZMax}
    }
_mcp_result["result"] = info
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown document tool: ${name}` }],
        isError: true,
      };
  }
}

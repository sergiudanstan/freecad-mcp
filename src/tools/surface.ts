import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const SURFACE_TOOLS = [
  {
    name: 'freecad_surface_filling',
    description: 'Create a surface by filling boundary edges (Gordon surface). Fills an enclosed boundary of edges with a smooth surface.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object containing boundary edges' },
        edgeNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Edge names forming the boundary (e.g., ["Edge1", "Edge2", "Edge3", "Edge4"])',
        },
        name: { type: 'string', description: 'Name for the surface' },
      },
      required: ['objectName', 'edgeNames'],
    },
  },
  {
    name: 'freecad_surface_geomfill',
    description: 'Create a surface from 2 to 4 boundary edges (Coons patch / Gordon surface)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              objectName: { type: 'string' },
              edgeName: { type: 'string' },
            },
            required: ['objectName', 'edgeName'],
          },
          description: 'Array of 2-4 edge references [{objectName, edgeName}]',
        },
        name: { type: 'string', description: 'Name for the surface' },
      },
      required: ['edges'],
    },
  },
  {
    name: 'freecad_surface_sections',
    description: 'Create a surface through cross-section curves (loft-like surface through profiles)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sectionNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of wire/edge objects to use as cross-sections',
        },
        name: { type: 'string', description: 'Name for the surface' },
      },
      required: ['sectionNames'],
    },
  },
  {
    name: 'freecad_surface_extend',
    description: 'Extend a surface face beyond its boundary in U and/or V direction',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object containing the face' },
        faceName: { type: 'string', description: 'Face to extend (e.g., "Face1")' },
        extensionLength: { type: 'number', description: 'Extension length in mm (default 10)' },
        name: { type: 'string', description: 'Name for the extended surface' },
      },
      required: ['objectName', 'faceName'],
    },
  },
  {
    name: 'freecad_surface_ruled',
    description: 'Create a ruled surface between two edges/wires (straight lines connecting corresponding points)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        edge1ObjectName: { type: 'string', description: 'Object name containing the first edge/wire' },
        edge1Name: { type: 'string', description: 'First edge reference (e.g., "Edge1")' },
        edge2ObjectName: { type: 'string', description: 'Object name containing the second edge/wire' },
        edge2Name: { type: 'string', description: 'Second edge reference (e.g., "Edge1")' },
        name: { type: 'string', description: 'Name for the ruled surface' },
      },
      required: ['edge1ObjectName', 'edge1Name', 'edge2ObjectName', 'edge2Name'],
    },
  },
];

export async function handleSurfaceTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(SURFACE_TOOLS, name, args);
  switch (name) {
    case 'freecad_surface_filling': {
      const objectName = args.objectName as string;
      const edgeNames = args.edgeNames as string[];
      const fillName = (args.name as string) || 'Filling';
      const edgeRefs = edgeNames.map(e => `(obj, ${JSON.stringify(e)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
fill = doc.addObject("Surface::Filling", ${JSON.stringify(fillName)})
fill.BoundaryEdges = [${edgeRefs}]
doc.recompute()
_mcp_result["result"] = {"name": fill.Name, "edges": ${JSON.stringify(edgeNames)}}
`);
    }

    case 'freecad_surface_geomfill': {
      const edges = args.edges as Array<{ objectName: string; edgeName: string }>;
      const gfName = (args.name as string) || 'GeomFillSurface';
      const edgeRefs = edges.map(e => `(doc.getObject(${JSON.stringify(e.objectName)}), ${JSON.stringify(e.edgeName)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
gf = doc.addObject("Surface::GeomFillSurface", ${JSON.stringify(gfName)})
gf.BoundaryList = [${edgeRefs}]
doc.recompute()
_mcp_result["result"] = {"name": gf.Name, "edgeCount": ${edges.length}}
`);
    }

    case 'freecad_surface_sections': {
      const sectionNames = args.sectionNames as string[];
      const secName = (args.name as string) || 'Sections';
      return bridge.run(`
${DOC_PREAMBLE}
sections = [doc.getObject(n) for n in ${JSON.stringify(sectionNames)}]
missing = [n for n, s in zip(${JSON.stringify(sectionNames)}, sections) if s is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
sec = doc.addObject("Surface::Sections", ${JSON.stringify(secName)})
sec.NSections = sections
doc.recompute()
_mcp_result["result"] = {"name": sec.Name, "sectionCount": ${sectionNames.length}}
`);
    }

    case 'freecad_surface_extend': {
      const objectName = args.objectName as string;
      const faceName = args.faceName as string;
      const extensionLength = (args.extensionLength as number) ?? 10;
      const extName = (args.name as string) || 'ExtendSurface';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
ext = doc.addObject("Surface::Extend", ${JSON.stringify(extName)})
ext.Face = (obj, [${JSON.stringify(faceName)}])
ext.Tolerance = 0.1
ext.ExtendUNeg = ${extensionLength}
ext.ExtendUPos = ${extensionLength}
ext.ExtendVNeg = ${extensionLength}
ext.ExtendVPos = ${extensionLength}
doc.recompute()
_mcp_result["result"] = {"name": ext.Name, "face": ${JSON.stringify(faceName)}, "extension": ${extensionLength}}
`);
    }

    case 'freecad_surface_ruled': {
      const e1Obj = args.edge1ObjectName as string;
      const e1Name = args.edge1Name as string;
      const e2Obj = args.edge2ObjectName as string;
      const e2Name = args.edge2Name as string;
      const rsName = (args.name as string) || 'RuledSurface';
      return bridge.run(`
${DOC_PREAMBLE}
obj1 = doc.getObject(${JSON.stringify(e1Obj)})
obj2 = doc.getObject(${JSON.stringify(e2Obj)})
if obj1 is None:
    raise ValueError("Object not found: " + ${JSON.stringify(e1Obj)})
if obj2 is None:
    raise ValueError("Object not found: " + ${JSON.stringify(e2Obj)})
edge1 = getattr(obj1.Shape, ${JSON.stringify(e1Name)})
edge2 = getattr(obj2.Shape, ${JSON.stringify(e2Name)})
ruled = Part.makeRuledSurface(edge1, edge2)
result = doc.addObject("Part::Feature", ${JSON.stringify(rsName)})
result.Shape = ruled
doc.recompute()
_mcp_result["result"] = {"name": result.Name, "area": result.Shape.Area}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown surface tool: ${name}` }],
        isError: true,
      };
  }
}

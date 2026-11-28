import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateFilePath, validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const TECHDRAW_TOOLS = [
  {
    name: 'freecad_techdraw_create_page',
    description: 'Create a TechDraw drawing page with a template (A4, A3, A2, A1, A0, or Letter)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string',
          enum: ['A4_Landscape', 'A4_Portrait', 'A3_Landscape', 'A3_Portrait', 'A2_Landscape', 'A1_Landscape', 'A0_Landscape', 'USLetter_Landscape', 'USLetter_Portrait'],
          description: 'Page template (default: A4_Landscape)',
        },
        name: { type: 'string', description: 'Name for the drawing page' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_techdraw_add_view',
    description: 'Add an orthographic view projection of a 3D object to a TechDraw page',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageName: { type: 'string', description: 'Name of the TechDraw page' },
        objectName: { type: 'string', description: 'Name of the 3D object to project' },
        direction: {
          type: 'string',
          enum: ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right', 'Isometric'],
          description: 'View direction (default: Front)',
        },
        scale: { type: 'number', description: 'View scale factor (default 1.0)' },
        x: { type: 'number', description: 'X position on the page in mm (default auto)' },
        y: { type: 'number', description: 'Y position on the page in mm (default auto)' },
        name: { type: 'string', description: 'Name for the view' },
      },
      required: ['pageName', 'objectName'],
    },
  },
  {
    name: 'freecad_techdraw_add_projection_group',
    description: 'Add a multi-view projection group (front + top + right + isometric views at once)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageName: { type: 'string', description: 'Name of the TechDraw page' },
        objectName: { type: 'string', description: 'Name of the 3D object to project' },
        views: {
          type: 'array',
          items: { type: 'string' },
          description: 'Views to include: "Front", "Rear", "Top", "Bottom", "Left", "Right" (default: ["Front", "Top", "Right"])',
        },
        scale: { type: 'number', description: 'View scale factor (default 1.0)' },
        name: { type: 'string', description: 'Name for the projection group' },
      },
      required: ['pageName', 'objectName'],
    },
  },
  {
    name: 'freecad_techdraw_add_dimension',
    description: 'Add a length dimension to a TechDraw view between two vertices or along an edge',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageName: { type: 'string', description: 'Name of the TechDraw page' },
        viewName: { type: 'string', description: 'Name of the TechDraw view' },
        dimensionType: {
          type: 'string',
          enum: ['distance', 'horizontal', 'vertical', 'radius', 'diameter', 'angle'],
          description: 'Type of dimension',
        },
        edge: { type: 'string', description: 'Edge reference (e.g., "Edge1") for single-edge dimensions' },
        vertex1: { type: 'string', description: 'First vertex reference (e.g., "Vertex1") for vertex-to-vertex dimensions' },
        vertex2: { type: 'string', description: 'Second vertex reference for vertex-to-vertex dimensions' },
        name: { type: 'string', description: 'Name for the dimension' },
      },
      required: ['pageName', 'viewName', 'dimensionType'],
    },
  },
  {
    name: 'freecad_techdraw_export_svg',
    description: 'Export a TechDraw page to an SVG file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageName: { type: 'string', description: 'Name of the TechDraw page to export' },
        filePath: { type: 'string', description: 'Absolute path for the output SVG file' },
      },
      required: ['pageName', 'filePath'],
    },
  },
  {
    name: 'freecad_techdraw_export_dxf',
    description: 'Export a TechDraw page to a DXF file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageName: { type: 'string', description: 'Name of the TechDraw page to export' },
        filePath: { type: 'string', description: 'Absolute path for the output DXF file' },
      },
      required: ['pageName', 'filePath'],
    },
  },
];

export async function handleTechDrawTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(TECHDRAW_TOOLS, name, args);
  switch (name) {
    case 'freecad_techdraw_create_page': {
      const template = (args.template as string) || 'A4_Landscape';
      const pageName = (args.name as string) || 'Page';
      return bridge.run(`
${DOC_PREAMBLE}
page = doc.addObject("TechDraw::DrawPage", ${JSON.stringify(pageName)})
# Find the template file
import os
template_name = ${JSON.stringify(template)} + ".svg"
# Try standard FreeCAD template locations
td_paths = [
    os.path.join(FreeCAD.getResourceDir(), "Mod", "TechDraw", "Templates"),
    os.path.join(FreeCAD.getResourceDir(), "share", "Mod", "TechDraw", "Templates"),
]
template_path = None
for tp in td_paths:
    candidate = os.path.join(tp, template_name)
    if os.path.exists(candidate):
        template_path = candidate
        break
if template_path:
    tmpl = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
    tmpl.Template = template_path
    page.Template = tmpl
doc.recompute()
_mcp_result["result"] = {"name": page.Name, "template": ${JSON.stringify(template)}, "hasTemplate": template_path is not None}
`);
    }

    case 'freecad_techdraw_add_view': {
      const pageName = args.pageName as string;
      const objectName = args.objectName as string;
      const direction = (args.direction as string) || 'Front';
      const scale = (args.scale as number) ?? 1.0;
      const x = args.x as number | undefined;
      const y = args.y as number | undefined;
      const viewName = (args.name as string) || 'View';
      const dirMap: Record<string, string> = {
        Front: 'FreeCAD.Vector(0, 0, 1)',
        Back: 'FreeCAD.Vector(0, 0, -1)',
        Top: 'FreeCAD.Vector(0, 1, 0)',
        Bottom: 'FreeCAD.Vector(0, -1, 0)',
        Left: 'FreeCAD.Vector(-1, 0, 0)',
        Right: 'FreeCAD.Vector(1, 0, 0)',
        Isometric: 'FreeCAD.Vector(1, 1, 1)',
      };
      const dirVec = dirMap[direction] || dirMap['Front'];
      return bridge.run(`
${DOC_PREAMBLE}
page = doc.getObject(${JSON.stringify(pageName)})
if page is None:
    raise ValueError("Page not found: " + ${JSON.stringify(pageName)})
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
view = doc.addObject("TechDraw::DrawViewPart", ${JSON.stringify(viewName)})
view.Source = [obj]
view.Direction = ${dirVec}
view.Scale = ${scale}
${x !== undefined ? `view.X = ${x}` : ''}
${y !== undefined ? `view.Y = ${y}` : ''}
page.addView(view)
doc.recompute()
_mcp_result["result"] = {"name": view.Name, "page": page.Name, "direction": ${JSON.stringify(direction)}, "scale": ${scale}}
`);
    }

    case 'freecad_techdraw_add_projection_group': {
      const pageName = args.pageName as string;
      const objectName = args.objectName as string;
      const views = (args.views as string[]) || ['Front', 'Top', 'Right'];
      const scale = (args.scale as number) ?? 1.0;
      const pgName = (args.name as string) || 'ProjGroup';
      const viewsList = views.map(v => JSON.stringify(v)).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
page = doc.getObject(${JSON.stringify(pageName)})
if page is None:
    raise ValueError("Page not found: " + ${JSON.stringify(pageName)})
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
pg = doc.addObject("TechDraw::DrawProjGroup", ${JSON.stringify(pgName)})
pg.Source = [obj]
pg.Scale = ${scale}
page.addView(pg)
# Add the anchor (front) view first
pg.addProjection("Front")
# Add additional views
for v in [${viewsList}]:
    if v != "Front":
        pg.addProjection(v)
doc.recompute()
_mcp_result["result"] = {"name": pg.Name, "page": page.Name, "views": [${viewsList}], "scale": ${scale}}
`);
    }

    case 'freecad_techdraw_add_dimension': {
      const pageName = args.pageName as string;
      const viewName = args.viewName as string;
      const dimensionType = args.dimensionType as string;
      const edge = args.edge as string | undefined;
      const vertex1 = args.vertex1 as string | undefined;
      const vertex2 = args.vertex2 as string | undefined;
      const dimName = (args.name as string) || 'Dimension';

      const typeMap: Record<string, string> = {
        distance: 'TechDraw::DrawViewDimension',
        horizontal: 'TechDraw::DrawViewDimension',
        vertical: 'TechDraw::DrawViewDimension',
        radius: 'TechDraw::DrawViewDimension',
        diameter: 'TechDraw::DrawViewDimension',
        angle: 'TechDraw::DrawViewDimension',
      };
      const dimType = typeMap[dimensionType] || 'TechDraw::DrawViewDimension';

      let refsCode: string;
      if (edge) {
        refsCode = `dim.References2D = [(view, ${JSON.stringify(edge)})]`;
      } else if (vertex1 && vertex2) {
        refsCode = `dim.References2D = [(view, ${JSON.stringify(vertex1)}), (view, ${JSON.stringify(vertex2)})]`;
      } else {
        return {
          content: [{ type: 'text', text: 'Must provide either edge or both vertex1 and vertex2' }],
          isError: true,
        };
      }

      return bridge.run(`
${DOC_PREAMBLE}
page = doc.getObject(${JSON.stringify(pageName)})
if page is None:
    raise ValueError("Page not found: " + ${JSON.stringify(pageName)})
view = doc.getObject(${JSON.stringify(viewName)})
if view is None:
    raise ValueError("View not found: " + ${JSON.stringify(viewName)})
dim = doc.addObject(${JSON.stringify(dimType)}, ${JSON.stringify(dimName)})
dim.Type = ${JSON.stringify(dimensionType.charAt(0).toUpperCase() + dimensionType.slice(1))}
${refsCode}
page.addView(dim)
doc.recompute()
_mcp_result["result"] = {"name": dim.Name, "type": ${JSON.stringify(dimensionType)}, "page": page.Name}
`);
    }

    case 'freecad_techdraw_export_svg': {
      const pageName = args.pageName as string;
      const filePath = validateFilePath(args.filePath, 'filePath');
      return bridge.run(`
${DOC_PREAMBLE}
import TechDraw
page = doc.getObject(${JSON.stringify(pageName)})
if page is None:
    raise ValueError("Page not found: " + ${JSON.stringify(pageName)})
doc.recompute()
TechDraw.writeSVGPage(page, ${JSON.stringify(filePath)})
import os
_mcp_result["result"] = {"page": page.Name, "filePath": ${JSON.stringify(filePath)}, "size_bytes": os.path.getsize(${JSON.stringify(filePath)})}
`);
    }

    case 'freecad_techdraw_export_dxf': {
      const pageName = args.pageName as string;
      const filePath = validateFilePath(args.filePath, 'filePath');
      return bridge.run(`
${DOC_PREAMBLE}
import TechDraw
page = doc.getObject(${JSON.stringify(pageName)})
if page is None:
    raise ValueError("Page not found: " + ${JSON.stringify(pageName)})
doc.recompute()
TechDraw.writeDXFPage(page, ${JSON.stringify(filePath)})
import os
_mcp_result["result"] = {"page": page.Name, "filePath": ${JSON.stringify(filePath)}, "size_bytes": os.path.getsize(${JSON.stringify(filePath)})}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown TechDraw tool: ${name}` }],
        isError: true,
      };
  }
}

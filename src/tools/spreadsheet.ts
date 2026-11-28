import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const SPREADSHEET_TOOLS = [
  {
    name: 'freecad_spreadsheet_create',
    description: 'Create a new spreadsheet for parametric design control. Cell values can be linked to object properties via expressions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the spreadsheet (default: "Spreadsheet")' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_spreadsheet_set',
    description: 'Set one or more cell values in a spreadsheet. Supports numbers, strings, and formulas (prefix with =).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sheetName: { type: 'string', description: 'Name of the spreadsheet' },
        cells: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cell: { type: 'string', description: 'Cell address (e.g., "A1", "B3")' },
              value: { type: 'string', description: 'Cell value — number, string, or formula starting with =' },
            },
            required: ['cell', 'value'],
          },
          description: 'Array of cell-value pairs to set',
        },
      },
      required: ['sheetName', 'cells'],
    },
  },
  {
    name: 'freecad_spreadsheet_get',
    description: 'Read cell values from a spreadsheet',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sheetName: { type: 'string', description: 'Name of the spreadsheet' },
        cells: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cell addresses to read (e.g., ["A1", "B2", "C3"])',
        },
      },
      required: ['sheetName', 'cells'],
    },
  },
  {
    name: 'freecad_spreadsheet_alias',
    description: 'Set an alias for a cell to use it as a named parameter in expressions (e.g., "Width" for cell A1)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sheetName: { type: 'string', description: 'Name of the spreadsheet' },
        cell: { type: 'string', description: 'Cell address (e.g., "A1")' },
        alias: { type: 'string', description: 'Alias name (e.g., "Width", "Height")' },
      },
      required: ['sheetName', 'cell', 'alias'],
    },
  },
  {
    name: 'freecad_set_expression',
    description: 'Bind an object property to a spreadsheet cell or expression for parametric control (e.g., Box.Length = Spreadsheet.Width)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the target object' },
        property: { type: 'string', description: 'Property name (e.g., "Length", "Height", "Radius")' },
        expression: { type: 'string', description: 'Expression string (e.g., "Spreadsheet.Width", "Spreadsheet.Width * 2")' },
      },
      required: ['objectName', 'property', 'expression'],
    },
  },
];

export async function handleSpreadsheetTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(SPREADSHEET_TOOLS, name, args);
  switch (name) {
    case 'freecad_spreadsheet_create': {
      const sheetName = (args.name as string) || 'Spreadsheet';
      return bridge.run(`
${DOC_PREAMBLE}
sheet = doc.addObject("Spreadsheet::Sheet", ${JSON.stringify(sheetName)})
doc.recompute()
_mcp_result["result"] = {"name": sheet.Name, "label": sheet.Label}
`);
    }

    case 'freecad_spreadsheet_set': {
      const sheetName = args.sheetName as string;
      const cells = args.cells as Array<{ cell: string; value: string }>;
      const cellsCode = cells.map(c =>
        `sheet.set(${JSON.stringify(c.cell)}, ${JSON.stringify(c.value)})`
      ).join('\n');
      return bridge.run(`
${DOC_PREAMBLE}
sheet = doc.getObject(${JSON.stringify(sheetName)})
if sheet is None:
    raise ValueError("Spreadsheet not found: " + ${JSON.stringify(sheetName)})
${cellsCode}
doc.recompute()
_mcp_result["result"] = {"sheet": sheet.Name, "cellsSet": ${cells.length}}
`);
    }

    case 'freecad_spreadsheet_get': {
      const sheetName = args.sheetName as string;
      const cells = args.cells as string[];
      return bridge.run(`
${DOC_PREAMBLE}
sheet = doc.getObject(${JSON.stringify(sheetName)})
if sheet is None:
    raise ValueError("Spreadsheet not found: " + ${JSON.stringify(sheetName)})
results = {}
for cell in ${JSON.stringify(cells)}:
    try:
        val = sheet.get(cell)
        results[cell] = str(val) if val is not None else None
    except:
        results[cell] = None
_mcp_result["result"] = {"sheet": sheet.Name, "values": results}
`);
    }

    case 'freecad_spreadsheet_alias': {
      const sheetName = args.sheetName as string;
      const cell = args.cell as string;
      const alias = args.alias as string;
      return bridge.run(`
${DOC_PREAMBLE}
sheet = doc.getObject(${JSON.stringify(sheetName)})
if sheet is None:
    raise ValueError("Spreadsheet not found: " + ${JSON.stringify(sheetName)})
sheet.setAlias(${JSON.stringify(cell)}, ${JSON.stringify(alias)})
doc.recompute()
_mcp_result["result"] = {"sheet": sheet.Name, "cell": ${JSON.stringify(cell)}, "alias": ${JSON.stringify(alias)}}
`);
    }

    case 'freecad_set_expression': {
      const objectName = args.objectName as string;
      const property = args.property as string;
      const expression = args.expression as string;
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
obj.setExpression(${JSON.stringify(property)}, ${JSON.stringify(expression)})
doc.recompute()
_mcp_result["result"] = {"object": obj.Name, "property": ${JSON.stringify(property)}, "expression": ${JSON.stringify(expression)}}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown spreadsheet tool: ${name}` }],
        isError: true,
      };
  }
}

#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FreeCADBridge } from './freecad-bridge.js';
import { resolveFreecadCmd } from './freecad-cmd.js';

import { DOCUMENT_TOOLS, handleDocumentTool } from './tools/document.js';
import { PRIMITIVE_TOOLS, handlePrimitiveTool } from './tools/primitives.js';
import { OPERATION_TOOLS, handleOperationTool } from './tools/operations.js';
import { SKETCHER_TOOLS, handleSketcherTool } from './tools/sketcher.js';
import { PART_DESIGN_TOOLS, handlePartDesignTool } from './tools/part-design.js';
import { IMPORT_EXPORT_TOOLS, handleImportExportTool } from './tools/import-export.js';
import { DRAFT_TOOLS, handleDraftTool } from './tools/draft.js';
import { MESH_TOOLS, handleMeshTool } from './tools/mesh.js';
import { TECHDRAW_TOOLS, handleTechDrawTool } from './tools/techdraw.js';
import { ADVANCED_OPERATION_TOOLS, handleAdvancedOperationTool } from './tools/advanced-operations.js';
import { SPREADSHEET_TOOLS, handleSpreadsheetTool } from './tools/spreadsheet.js';
import { BIM_TOOLS, handleBimTool } from './tools/bim.js';
import { FEM_TOOLS, handleFemTool } from './tools/fem.js';
import { SURFACE_TOOLS, handleSurfaceTool } from './tools/surface.js';
import { ASSEMBLY_TOOLS, handleAssemblyTool } from './tools/assembly.js';

const FREECAD_CMD = resolveFreecadCmd();

const ALL_TOOLS = [
  ...DOCUMENT_TOOLS,
  ...PRIMITIVE_TOOLS,
  ...OPERATION_TOOLS,
  ...SKETCHER_TOOLS,
  ...PART_DESIGN_TOOLS,
  ...IMPORT_EXPORT_TOOLS,
  ...DRAFT_TOOLS,
  ...MESH_TOOLS,
  ...TECHDRAW_TOOLS,
  ...ADVANCED_OPERATION_TOOLS,
  ...SPREADSHEET_TOOLS,
  ...BIM_TOOLS,
  ...FEM_TOOLS,
  ...SURFACE_TOOLS,
  ...ASSEMBLY_TOOLS,
];

const TOOL_HANDLERS: Record<string, string> = {};
for (const tool of DOCUMENT_TOOLS) TOOL_HANDLERS[tool.name] = 'document';
for (const tool of PRIMITIVE_TOOLS) TOOL_HANDLERS[tool.name] = 'primitives';
for (const tool of OPERATION_TOOLS) TOOL_HANDLERS[tool.name] = 'operations';
for (const tool of SKETCHER_TOOLS) TOOL_HANDLERS[tool.name] = 'sketcher';
for (const tool of PART_DESIGN_TOOLS) TOOL_HANDLERS[tool.name] = 'part-design';
for (const tool of IMPORT_EXPORT_TOOLS) TOOL_HANDLERS[tool.name] = 'import-export';
for (const tool of DRAFT_TOOLS) TOOL_HANDLERS[tool.name] = 'draft';
for (const tool of MESH_TOOLS) TOOL_HANDLERS[tool.name] = 'mesh';
for (const tool of TECHDRAW_TOOLS) TOOL_HANDLERS[tool.name] = 'techdraw';
for (const tool of ADVANCED_OPERATION_TOOLS) TOOL_HANDLERS[tool.name] = 'advanced-operations';
for (const tool of SPREADSHEET_TOOLS) TOOL_HANDLERS[tool.name] = 'spreadsheet';
for (const tool of BIM_TOOLS) TOOL_HANDLERS[tool.name] = 'bim';
for (const tool of FEM_TOOLS) TOOL_HANDLERS[tool.name] = 'fem';
for (const tool of SURFACE_TOOLS) TOOL_HANDLERS[tool.name] = 'surface';
for (const tool of ASSEMBLY_TOOLS) TOOL_HANDLERS[tool.name] = 'assembly';

class FreeCADMCPServer {
  private server: Server;
  private bridge: FreeCADBridge;

  constructor() {
    this.bridge = new FreeCADBridge(FREECAD_CMD);

    this.server = new Server(
      {
        name: 'freecad-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: ALL_TOOLS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const safeArgs = (args || {}) as Record<string, unknown>;
      const module = TOOL_HANDLERS[name];

      if (!module) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        switch (module) {
          case 'document':
            return await handleDocumentTool(name, safeArgs, this.bridge);
          case 'primitives':
            return await handlePrimitiveTool(name, safeArgs, this.bridge);
          case 'operations':
            return await handleOperationTool(name, safeArgs, this.bridge);
          case 'sketcher':
            return await handleSketcherTool(name, safeArgs, this.bridge);
          case 'part-design':
            return await handlePartDesignTool(name, safeArgs, this.bridge);
          case 'import-export':
            return await handleImportExportTool(name, safeArgs, this.bridge);
          case 'draft':
            return await handleDraftTool(name, safeArgs, this.bridge);
          case 'mesh':
            return await handleMeshTool(name, safeArgs, this.bridge);
          case 'techdraw':
            return await handleTechDrawTool(name, safeArgs, this.bridge);
          case 'advanced-operations':
            return await handleAdvancedOperationTool(name, safeArgs, this.bridge);
          case 'spreadsheet':
            return await handleSpreadsheetTool(name, safeArgs, this.bridge);
          case 'bim':
            return await handleBimTool(name, safeArgs, this.bridge);
          case 'fem':
            return await handleFemTool(name, safeArgs, this.bridge);
          case 'surface':
            return await handleSurfaceTool(name, safeArgs, this.bridge);
          case 'assembly':
            return await handleAssemblyTool(name, safeArgs, this.bridge);
          default:
            return {
              content: [{ type: 'text', text: `No handler for module: ${module}` }],
              isError: true,
            };
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[FreeCAD MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      `FreeCAD MCP Server v2.0.0 running (cmd: ${FREECAD_CMD}, tools: ${ALL_TOOLS.length})`
    );
  }
}

const server = new FreeCADMCPServer();
server.run().catch((error) => {
  console.error('Failed to start FreeCAD MCP server:', error);
  process.exit(1);
});

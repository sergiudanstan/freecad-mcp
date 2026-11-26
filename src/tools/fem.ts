import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const FEM_TOOLS = [
  {
    name: 'freecad_fem_analysis',
    description: 'Create a FEM analysis container for finite element simulation',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the analysis (default: "Analysis")' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_fem_material',
    description: 'Add a material definition to the FEM analysis (e.g., steel, aluminum, etc.)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        materialName: { type: 'string', description: 'Material type — "Steel", "Aluminum", "Concrete", or "Custom"' },
        youngsModulus: { type: 'number', description: 'Young\'s modulus in MPa (for Custom material)' },
        poissonRatio: { type: 'number', description: 'Poisson\'s ratio (for Custom material, default 0.3)' },
        density: { type: 'number', description: 'Density in kg/m³ (for Custom material)' },
        name: { type: 'string', description: 'Name for the material object' },
      },
      required: ['analysisName'],
    },
  },
  {
    name: 'freecad_fem_constraint_fixed',
    description: 'Add a fixed boundary condition (fixed support) to faces/edges of the model',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        objectName: { type: 'string', description: 'Name of the object' },
        references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Face/edge references to fix (e.g., ["Face1", "Face2"])',
        },
        name: { type: 'string', description: 'Name for the constraint' },
      },
      required: ['analysisName', 'objectName', 'references'],
    },
  },
  {
    name: 'freecad_fem_constraint_force',
    description: 'Apply a force load to faces/edges of the model',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        objectName: { type: 'string', description: 'Name of the object' },
        references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Face/edge references to apply force to (e.g., ["Face3"])',
        },
        force: { type: 'number', description: 'Force magnitude in N' },
        directionX: { type: 'number', description: 'X component of force direction (default 0)' },
        directionY: { type: 'number', description: 'Y component of force direction (default 0)' },
        directionZ: { type: 'number', description: 'Z component of force direction (default -1, i.e., downward)' },
        name: { type: 'string', description: 'Name for the force constraint' },
      },
      required: ['analysisName', 'objectName', 'references', 'force'],
    },
  },
  {
    name: 'freecad_fem_constraint_pressure',
    description: 'Apply a pressure load to faces of the model',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        objectName: { type: 'string', description: 'Name of the object' },
        references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Face references to apply pressure to (e.g., ["Face1"])',
        },
        pressure: { type: 'number', description: 'Pressure in MPa' },
        reversed: { type: 'boolean', description: 'Reverse direction (default false)' },
        name: { type: 'string', description: 'Name for the pressure constraint' },
      },
      required: ['analysisName', 'objectName', 'references', 'pressure'],
    },
  },
  {
    name: 'freecad_fem_mesh',
    description: 'Generate a tetrahedral FEM mesh for an object using Gmsh or Netgen',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        objectName: { type: 'string', description: 'Name of the object to mesh' },
        maxElementSize: { type: 'number', description: 'Maximum element size in mm (default 0 = auto)' },
        minElementSize: { type: 'number', description: 'Minimum element size in mm (default 0 = auto)' },
        meshOrder: { type: 'number', description: 'Element order: 1 (linear) or 2 (quadratic, default)' },
        name: { type: 'string', description: 'Name for the mesh object' },
      },
      required: ['analysisName', 'objectName'],
    },
  },
  {
    name: 'freecad_fem_solver',
    description: 'Add a FEM solver (CalculiX or Elmer) and optionally run the analysis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
        solver: {
          type: 'string',
          enum: ['calculix', 'elmer'],
          description: 'Solver type (default: calculix)',
        },
        analysisType: {
          type: 'string',
          enum: ['static', 'frequency', 'thermomech', 'buckling'],
          description: 'Type of analysis (default: static)',
        },
        run: { type: 'boolean', description: 'Run the solver immediately (default false)' },
        name: { type: 'string', description: 'Name for the solver object' },
      },
      required: ['analysisName'],
    },
  },
  {
    name: 'freecad_fem_results',
    description: 'Read FEM analysis results (displacement, stress, strain) after solving',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysisName: { type: 'string', description: 'Name of the FEM analysis' },
      },
      required: ['analysisName'],
    },
  },
];

export async function handleFemTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  switch (name) {
    case 'freecad_fem_analysis': {
      const analysisName = (args.name as string) || 'Analysis';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = ObjectsFem.makeAnalysis(doc, ${JSON.stringify(analysisName)})
doc.recompute()
_mcp_result["result"] = {"name": analysis.Name, "label": analysis.Label}
`);
    }

    case 'freecad_fem_material': {
      const analysisName = args.analysisName as string;
      const materialName = (args.materialName as string) || 'Steel';
      const matObjName = (args.name as string) || 'Material';

      const materialPresets: Record<string, string> = {
        Steel: `mat_obj.Material = {"Name": "Steel", "YoungsModulus": "210000 MPa", "PoissonRatio": "0.3", "Density": "7900 kg/m^3"}`,
        Aluminum: `mat_obj.Material = {"Name": "Aluminum", "YoungsModulus": "70000 MPa", "PoissonRatio": "0.33", "Density": "2700 kg/m^3"}`,
        Concrete: `mat_obj.Material = {"Name": "Concrete", "YoungsModulus": "30000 MPa", "PoissonRatio": "0.2", "Density": "2400 kg/m^3"}`,
      };

      const youngsModulus = args.youngsModulus as number | undefined;
      const poissonRatio = (args.poissonRatio as number) ?? 0.3;
      const density = args.density as number | undefined;

      let matCode: string;
      if (materialName === 'Custom' && youngsModulus !== undefined && density !== undefined) {
        matCode = `mat_obj.Material = {"Name": "Custom", "YoungsModulus": "${youngsModulus} MPa", "PoissonRatio": "${poissonRatio}", "Density": "${density} kg/m^3"}`;
      } else {
        matCode = materialPresets[materialName] || materialPresets['Steel'];
      }

      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
mat_obj = ObjectsFem.makeMaterialSolid(doc, ${JSON.stringify(matObjName)})
${matCode}
analysis.addObject(mat_obj)
doc.recompute()
_mcp_result["result"] = {"name": mat_obj.Name, "material": ${JSON.stringify(materialName)}}
`);
    }

    case 'freecad_fem_constraint_fixed': {
      const analysisName = args.analysisName as string;
      const objectName = args.objectName as string;
      const references = args.references as string[];
      const constraintName = (args.name as string) || 'ConstraintFixed';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
fixed = ObjectsFem.makeConstraintFixed(doc, ${JSON.stringify(constraintName)})
fixed.References = [(obj, ${JSON.stringify(references).replace(/"/g, '"')})]
analysis.addObject(fixed)
doc.recompute()
_mcp_result["result"] = {"name": fixed.Name, "references": ${JSON.stringify(references)}}
`);
    }

    case 'freecad_fem_constraint_force': {
      const analysisName = args.analysisName as string;
      const objectName = args.objectName as string;
      const references = args.references as string[];
      const force = args.force as number;
      const dirX = (args.directionX as number) ?? 0;
      const dirY = (args.directionY as number) ?? 0;
      const dirZ = (args.directionZ as number) ?? -1;
      const constraintName = (args.name as string) || 'ConstraintForce';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
force_obj = ObjectsFem.makeConstraintForce(doc, ${JSON.stringify(constraintName)})
force_obj.References = [(obj, ${JSON.stringify(references).replace(/"/g, '"')})]
force_obj.Force = ${force}
force_obj.Direction = None
force_obj.Reversed = False
analysis.addObject(force_obj)
doc.recompute()
_mcp_result["result"] = {"name": force_obj.Name, "force": ${force}, "references": ${JSON.stringify(references)}}
`);
    }

    case 'freecad_fem_constraint_pressure': {
      const analysisName = args.analysisName as string;
      const objectName = args.objectName as string;
      const references = args.references as string[];
      const pressure = args.pressure as number;
      const reversed = (args.reversed as boolean) ?? false;
      const constraintName = (args.name as string) || 'ConstraintPressure';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
pressure_obj = ObjectsFem.makeConstraintPressure(doc, ${JSON.stringify(constraintName)})
pressure_obj.References = [(obj, ${JSON.stringify(references).replace(/"/g, '"')})]
pressure_obj.Pressure = ${pressure}
pressure_obj.Reversed = ${reversed ? 'True' : 'False'}
analysis.addObject(pressure_obj)
doc.recompute()
_mcp_result["result"] = {"name": pressure_obj.Name, "pressure": ${pressure}, "references": ${JSON.stringify(references)}}
`);
    }

    case 'freecad_fem_mesh': {
      const analysisName = args.analysisName as string;
      const objectName = args.objectName as string;
      const maxSize = (args.maxElementSize as number) ?? 0;
      const minSize = (args.minElementSize as number) ?? 0;
      const meshOrder = (args.meshOrder as number) ?? 2;
      const meshName = (args.name as string) || 'FEMMesh';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: ${objectName}")
mesh = ObjectsFem.makeMeshGmsh(doc, ${JSON.stringify(meshName)})
mesh.Shape = obj  # 'Part' was renamed to 'Shape' in FreeCAD 1.0
${maxSize > 0 ? `mesh.CharacteristicLengthMax = ${maxSize}` : ''}
${minSize > 0 ? `mesh.CharacteristicLengthMin = ${minSize}` : ''}
mesh.ElementOrder = ${JSON.stringify(meshOrder === 1 ? '1st' : '2nd')}
analysis.addObject(mesh)
doc.recompute()
# Gmsh raises on failure; the bridge reports the message.
from femmesh.gmshtools import GmshTools
GmshTools(mesh).create_mesh()
doc.recompute()
fem_mesh = mesh.FemMesh
_mcp_result["result"] = {
    "name": mesh.Name,
    "nodes": fem_mesh.NodeCount,
    "elements": fem_mesh.EdgeCount + fem_mesh.FaceCount + fem_mesh.VolumeCount,
    "volumes": fem_mesh.VolumeCount,
    "order": ${meshOrder}
}
`);
    }

    case 'freecad_fem_solver': {
      const analysisName = args.analysisName as string;
      const solver = (args.solver as string) || 'calculix';
      const analysisType = (args.analysisType as string) || 'static';
      const run = (args.run as boolean) ?? false;
      const solverName = (args.name as string) || 'Solver';
      return bridge.run(`
${DOC_PREAMBLE}
import ObjectsFem
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
${solver === 'calculix'
  ? `solver = ObjectsFem.makeSolverCalculiXCcxTools(doc, ${JSON.stringify(solverName)})`
  : `solver = ObjectsFem.makeSolverElmer(doc, ${JSON.stringify(solverName)})`}
solver.AnalysisType = ${JSON.stringify(analysisType)}
analysis.addObject(solver)
doc.recompute()
result = {"name": solver.Name, "solver": ${JSON.stringify(solver)}, "analysisType": ${JSON.stringify(analysisType)}, "run": False}
${run ? `
from femtools import ccxtools
fea = ccxtools.FemToolsCcx(analysis, solver)
fea.purge_results()
fea.run()
result["run"] = True
result["status"] = "completed"
` : ''}
_mcp_result["result"] = result
`);
    }

    case 'freecad_fem_results': {
      const analysisName = args.analysisName as string;
      return bridge.run(`
${DOC_PREAMBLE}
analysis = doc.getObject(${JSON.stringify(analysisName)})
if analysis is None:
    raise ValueError("Analysis not found: ${analysisName}")
# Find result objects in the analysis
results = []
for obj in analysis.Group:
    if hasattr(obj, "Stats"):
        stats = obj.Stats
        results.append({
            "name": obj.Name,
            "type": obj.TypeId,
            "stats": {
                "maxDisplacement": stats[0] if len(stats) > 0 else None,
                "minStress": stats[1] if len(stats) > 1 else None,
                "maxStress": stats[2] if len(stats) > 2 else None,
                "maxDisplacementAbs": stats[4] if len(stats) > 4 else None,
            }
        })
    elif obj.TypeId == "Fem::FemResultObject":
        res = {
            "name": obj.Name,
            "type": obj.TypeId,
        }
        if hasattr(obj, "DisplacementLengths") and obj.DisplacementLengths:
            res["maxDisplacement"] = max(obj.DisplacementLengths)
        if hasattr(obj, "vonMises") and obj.vonMises:
            res["maxVonMises"] = max(obj.vonMises)
            res["minVonMises"] = min(obj.vonMises)
        results.append(res)
_mcp_result["result"] = {"analysis": analysis.Name, "resultCount": len(results), "results": results}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown FEM tool: ${name}` }],
        isError: true,
      };
  }
}

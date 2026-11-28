import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const ASSEMBLY_TOOLS = [
  {
    name: 'freecad_assembly_create',
    description: 'Create a new Assembly container for assembling parts with joints/constraints',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the assembly (default: "Assembly")' },
      },
      required: [],
    },
  },
  {
    name: 'freecad_assembly_insert_component',
    description: 'Insert a part or body into an assembly as a component',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        objectName: { type: 'string', description: 'Name of the object to insert' },
        x: { type: 'number', description: 'X placement offset (default 0)' },
        y: { type: 'number', description: 'Y placement offset (default 0)' },
        z: { type: 'number', description: 'Z placement offset (default 0)' },
      },
      required: ['assemblyName', 'objectName'],
    },
  },
  {
    name: 'freecad_assembly_toggle_grounded',
    description: 'Toggle whether a component is grounded (fixed in space) in the assembly',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        componentName: { type: 'string', description: 'Name of the component to ground/unground' },
      },
      required: ['assemblyName', 'componentName'],
    },
  },
  {
    name: 'freecad_assembly_fixed_joint',
    description: 'Create a fixed joint locking two components rigidly together',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Element reference on component1 (e.g., "Face1")' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Element reference on component2 (e.g., "Face1")' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2'],
    },
  },
  {
    name: 'freecad_assembly_revolute_joint',
    description: 'Create a revolute (hinge) joint between two components — allows rotation around one axis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Cylindrical face or edge on component1' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Cylindrical face or edge on component2' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2'],
    },
  },
  {
    name: 'freecad_assembly_slider_joint',
    description: 'Create a slider (prismatic) joint — allows linear translation along one axis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Face or edge on component1' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Face or edge on component2' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2'],
    },
  },
  {
    name: 'freecad_assembly_cylindrical_joint',
    description: 'Create a cylindrical joint — allows rotation and translation along the same axis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Cylindrical face on component1' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Cylindrical face on component2' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2'],
    },
  },
  {
    name: 'freecad_assembly_ball_joint',
    description: 'Create a ball (spherical) joint — allows rotation in all 3 axes',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Spherical face or vertex on component1' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Spherical face or vertex on component2' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2'],
    },
  },
  {
    name: 'freecad_assembly_distance_joint',
    description: 'Create a distance constraint between two components',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly' },
        component1: { type: 'string', description: 'Name of the first component' },
        element1: { type: 'string', description: 'Element on component1' },
        component2: { type: 'string', description: 'Name of the second component' },
        element2: { type: 'string', description: 'Element on component2' },
        distance: { type: 'number', description: 'Distance value in mm' },
        name: { type: 'string', description: 'Name for the joint' },
      },
      required: ['assemblyName', 'component1', 'element1', 'component2', 'element2', 'distance'],
    },
  },
  {
    name: 'freecad_assembly_solve',
    description: 'Solve the assembly constraints to compute final positions of all components',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assemblyName: { type: 'string', description: 'Name of the assembly to solve' },
      },
      required: ['assemblyName'],
    },
  },
];

// FreeCAD 1.x stores joints as App::FeaturePython objects driven by JointObject.Joint,
// inside the assembly's JointGroup (see Mod/Assembly/AssemblyTests/TestCore.py).
// A reference is [object, [element, anchor]]; repeating the element as the anchor
// places the joint at the element's centre (UtilsAssembly.findPlacement).
function makeJointCode(
  jointType: string,
  assemblyName: string,
  comp1: string,
  elem1: string,
  comp2: string,
  elem2: string,
  jointName: string,
  extraProps: string = '',
): string {
  return `
${DOC_PREAMBLE}
import JointObject
import UtilsAssembly
assembly = doc.getObject(${JSON.stringify(assemblyName)})
if assembly is None:
    raise ValueError("Assembly not found: " + ${JSON.stringify(assemblyName)})
parts = {}
for key, part_name in (("c1", ${JSON.stringify(comp1)}), ("c2", ${JSON.stringify(comp2)})):
    parts[key] = doc.getObject(part_name)
    if parts[key] is None:
        raise ValueError("Component not found: " + part_name)
joint = UtilsAssembly.getJointGroup(assembly).newObject("App::FeaturePython", ${JSON.stringify(jointName)})
JointObject.Joint(joint, JointObject.JointTypes.index(${JSON.stringify(jointType)}))
${extraProps}
joint.Proxy.setJointConnectors(joint, [
    [parts["c1"], [${JSON.stringify(elem1)}, ${JSON.stringify(elem1)}]],
    [parts["c2"], [${JSON.stringify(elem2)}, ${JSON.stringify(elem2)}]],
])
doc.recompute()
_mcp_result["result"] = {"name": joint.Name, "type": joint.JointType, "component1": ${JSON.stringify(comp1)}, "component2": ${JSON.stringify(comp2)}}
`;
}

export async function handleAssemblyTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(ASSEMBLY_TOOLS, name, args);
  switch (name) {
    case 'freecad_assembly_create': {
      const asmName = (args.name as string) || 'Assembly';
      return bridge.run(`
${DOC_PREAMBLE}
assembly = doc.addObject("Assembly::AssemblyObject", ${JSON.stringify(asmName)})
doc.recompute()
_mcp_result["result"] = {"name": assembly.Name, "label": assembly.Label}
`);
    }

    case 'freecad_assembly_insert_component': {
      const assemblyName = args.assemblyName as string;
      const objectName = args.objectName as string;
      const x = (args.x as number) ?? 0;
      const y = (args.y as number) ?? 0;
      const z = (args.z as number) ?? 0;
      return bridge.run(`
${DOC_PREAMBLE}
assembly = doc.getObject(${JSON.stringify(assemblyName)})
if assembly is None:
    raise ValueError("Assembly not found: " + ${JSON.stringify(assemblyName)})
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
link = doc.addObject("App::Link", ${JSON.stringify(objectName + '_Link')})
link.LinkedObject = obj
link.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
assembly.addObject(link)
doc.recompute()
_mcp_result["result"] = {"name": link.Name, "linkedTo": obj.Name, "position": {"x": ${x}, "y": ${y}, "z": ${z}}}
`);
    }

    case 'freecad_assembly_toggle_grounded': {
      const assemblyName = args.assemblyName as string;
      const componentName = args.componentName as string;
      return bridge.run(`
${DOC_PREAMBLE}
assembly = doc.getObject(${JSON.stringify(assemblyName)})
if assembly is None:
    raise ValueError("Assembly not found: " + ${JSON.stringify(assemblyName)})
comp = doc.getObject(${JSON.stringify(componentName)})
if comp is None:
    raise ValueError("Component not found: " + ${JSON.stringify(componentName)})
import JointObject
import UtilsAssembly
grounded = UtilsAssembly.getJointGroup(assembly).newObject("App::FeaturePython", "Grounded_" + comp.Name)
JointObject.GroundedJoint(grounded, comp)
doc.recompute()
_mcp_result["result"] = {"name": grounded.Name, "component": comp.Name, "grounded": True}
`);
    }

    case 'freecad_assembly_fixed_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const jName = (args.name as string) || 'FixedJoint';
      return bridge.run(makeJointCode('Fixed', assemblyName, comp1, elem1, comp2, elem2, jName));
    }

    case 'freecad_assembly_revolute_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const jName = (args.name as string) || 'RevoluteJoint';
      return bridge.run(makeJointCode('Revolute', assemblyName, comp1, elem1, comp2, elem2, jName));
    }

    case 'freecad_assembly_slider_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const jName = (args.name as string) || 'SliderJoint';
      return bridge.run(makeJointCode('Slider', assemblyName, comp1, elem1, comp2, elem2, jName));
    }

    case 'freecad_assembly_cylindrical_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const jName = (args.name as string) || 'CylindricalJoint';
      return bridge.run(makeJointCode('Cylindrical', assemblyName, comp1, elem1, comp2, elem2, jName));
    }

    case 'freecad_assembly_ball_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const jName = (args.name as string) || 'BallJoint';
      return bridge.run(makeJointCode('Ball', assemblyName, comp1, elem1, comp2, elem2, jName));
    }

    case 'freecad_assembly_distance_joint': {
      const assemblyName = args.assemblyName as string;
      const comp1 = args.component1 as string;
      const elem1 = args.element1 as string;
      const comp2 = args.component2 as string;
      const elem2 = args.element2 as string;
      const distance = args.distance as number;
      const jName = (args.name as string) || 'DistanceJoint';
      return bridge.run(makeJointCode('Distance', assemblyName, comp1, elem1, comp2, elem2, jName, `joint.Distance = ${distance}`));
    }

    case 'freecad_assembly_solve': {
      const assemblyName = args.assemblyName as string;
      return bridge.run(`
${DOC_PREAMBLE}
assembly = doc.getObject(${JSON.stringify(assemblyName)})
if assembly is None:
    raise ValueError("Assembly not found: " + ${JSON.stringify(assemblyName)})
import UtilsAssembly
solver_status = assembly.solve()
doc.recompute()
joints = [o for o in UtilsAssembly.getJointGroup(assembly).Group if hasattr(o, "JointType")]
components = [o for o in assembly.Group if o.TypeId == "App::Link"]
_mcp_result["result"] = {"assembly": assembly.Name, "joints": len(joints), "components": len(components), "status": "solved" if solver_status == 0 else "failed", "solverCode": solver_status}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown assembly tool: ${name}` }],
        isError: true,
      };
  }
}

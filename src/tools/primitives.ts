import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { validatePositiveNumber, validateNonNegativeNumber, validateNumber, escapePythonString, validateToolArgs } from '../validation.js';

export const PRIMITIVE_TOOLS = [
  {
    name: 'freecad_create_box',
    description: 'Create a Part::Box primitive in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        length: { type: 'number', description: 'Box length (X dimension)' },
        width: { type: 'number', description: 'Box width (Y dimension)' },
        height: { type: 'number', description: 'Box height (Z dimension)' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['length', 'width', 'height'],
    },
  },
  {
    name: 'freecad_create_cylinder',
    description: 'Create a Part::Cylinder primitive in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        radius: { type: 'number', description: 'Cylinder radius' },
        height: { type: 'number', description: 'Cylinder height' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['radius', 'height'],
    },
  },
  {
    name: 'freecad_create_sphere',
    description: 'Create a Part::Sphere primitive in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        radius: { type: 'number', description: 'Sphere radius' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['radius'],
    },
  },
  {
    name: 'freecad_create_cone',
    description: 'Create a Part::Cone primitive in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        radius1: { type: 'number', description: 'Bottom radius' },
        radius2: { type: 'number', description: 'Top radius' },
        height: { type: 'number', description: 'Cone height' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['radius1', 'radius2', 'height'],
    },
  },
  {
    name: 'freecad_create_torus',
    description: 'Create a Part::Torus primitive in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        radius1: { type: 'number', description: 'Major radius (center to tube center)' },
        radius2: { type: 'number', description: 'Minor radius (tube radius)' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['radius1', 'radius2'],
    },
  },
  {
    name: 'freecad_create_wedge',
    description: 'Create a Part wedge (tapered box) in the active document.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        xmin: { type: 'number', description: 'X minimum' },
        ymin: { type: 'number', description: 'Y minimum' },
        zmin: { type: 'number', description: 'Z minimum' },
        x2min: { type: 'number', description: 'X2 minimum (top face)' },
        z2min: { type: 'number', description: 'Z2 minimum (top face)' },
        xmax: { type: 'number', description: 'X maximum' },
        ymax: { type: 'number', description: 'Y maximum' },
        zmax: { type: 'number', description: 'Z maximum' },
        x2max: { type: 'number', description: 'X2 maximum (top face)' },
        z2max: { type: 'number', description: 'Z2 maximum (top face)' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['xmin', 'ymin', 'zmin', 'x2min', 'z2min', 'xmax', 'ymax', 'zmax', 'x2max', 'z2max'],
    },
  },
  {
    name: 'freecad_create_helix',
    description: 'Create a helix curve (for springs, threads, coils)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pitch: { type: 'number', description: 'Distance between turns in mm' },
        height: { type: 'number', description: 'Total helix height in mm' },
        radius: { type: 'number', description: 'Helix radius in mm' },
        angle: { type: 'number', description: 'Taper angle in degrees (0 = uniform, default 0)' },
        leftHanded: { type: 'boolean', description: 'Left-handed helix (default false)' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['pitch', 'height', 'radius'],
    },
  },
  {
    name: 'freecad_create_spiral',
    description: 'Create a flat spiral curve (for scroll pumps, watch springs)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        growth: { type: 'number', description: 'Radial growth per revolution in mm' },
        rotations: { type: 'number', description: 'Number of full rotations' },
        radius: { type: 'number', description: 'Starting radius in mm' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['growth', 'rotations', 'radius'],
    },
  },
  {
    name: 'freecad_create_ellipsoid',
    description: 'Create an ellipsoid (non-uniform sphere with 3 radii)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        radius1: { type: 'number', description: 'Radius in polar direction (Z)' },
        radius2: { type: 'number', description: 'Radius in equatorial direction (X/Y)' },
        radius3: { type: 'number', description: 'Third radius for triaxial ellipsoid (default same as radius2)' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['radius1', 'radius2'],
    },
  },
  {
    name: 'freecad_create_tube',
    description: 'Create a hollow tube/pipe (cylinder with inner hole)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outerRadius: { type: 'number', description: 'Outer radius in mm' },
        innerRadius: { type: 'number', description: 'Inner radius in mm' },
        height: { type: 'number', description: 'Tube height in mm' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['outerRadius', 'innerRadius', 'height'],
    },
  },
  {
    name: 'freecad_create_prism',
    description: 'Create a regular prism (polygon extruded to height)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sides: { type: 'number', description: 'Number of sides (3=triangular, 6=hexagonal, etc.)' },
        radius: { type: 'number', description: 'Circumscribed circle radius in mm' },
        height: { type: 'number', description: 'Prism height in mm' },
        name: { type: 'string', description: 'Optional object name' },
      },
      required: ['sides', 'radius', 'height'],
    },
  },
];

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export async function handlePrimitiveTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(PRIMITIVE_TOOLS, name, args);
  switch (name) {
    case 'freecad_create_box': {
      const objName = escapePythonString((args.name as string) || 'Box');
      const length = validatePositiveNumber(args.length, 'length');
      const width = validatePositiveNumber(args.width, 'width');
      const height = validatePositiveNumber(args.height, 'height');
      const code = `
${DOC_PREAMBLE}
box = doc.addObject("Part::Box", "${objName}")
box.Length = ${length}
box.Width = ${width}
box.Height = ${height}
doc.recompute()
_mcp_result["result"] = {"name": box.Name, "label": box.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_cylinder': {
      const objName = escapePythonString((args.name as string) || 'Cylinder');
      const radius = validatePositiveNumber(args.radius, 'radius');
      const height = validatePositiveNumber(args.height, 'height');
      const code = `
${DOC_PREAMBLE}
cyl = doc.addObject("Part::Cylinder", "${objName}")
cyl.Radius = ${radius}
cyl.Height = ${height}
doc.recompute()
_mcp_result["result"] = {"name": cyl.Name, "label": cyl.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_sphere': {
      const objName = escapePythonString((args.name as string) || 'Sphere');
      const radius = validatePositiveNumber(args.radius, 'radius');
      const code = `
${DOC_PREAMBLE}
sph = doc.addObject("Part::Sphere", "${objName}")
sph.Radius = ${radius}
doc.recompute()
_mcp_result["result"] = {"name": sph.Name, "label": sph.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_cone': {
      const objName = escapePythonString((args.name as string) || 'Cone');
      const radius1 = validateNonNegativeNumber(args.radius1, 'radius1');
      const radius2 = validateNonNegativeNumber(args.radius2, 'radius2');
      const height = validatePositiveNumber(args.height, 'height');
      const code = `
${DOC_PREAMBLE}
cone = doc.addObject("Part::Cone", "${objName}")
cone.Radius1 = ${radius1}
cone.Radius2 = ${radius2}
cone.Height = ${height}
doc.recompute()
_mcp_result["result"] = {"name": cone.Name, "label": cone.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_torus': {
      const objName = escapePythonString((args.name as string) || 'Torus');
      const radius1 = validatePositiveNumber(args.radius1, 'radius1');
      const radius2 = validatePositiveNumber(args.radius2, 'radius2');
      const code = `
${DOC_PREAMBLE}
tor = doc.addObject("Part::Torus", "${objName}")
tor.Radius1 = ${radius1}
tor.Radius2 = ${radius2}
doc.recompute()
_mcp_result["result"] = {"name": tor.Name, "label": tor.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_wedge': {
      const objName = escapePythonString((args.name as string) || 'Wedge');
      for (const key of ['xmin', 'ymin', 'zmin', 'x2min', 'z2min', 'xmax', 'ymax', 'zmax', 'x2max', 'z2max']) {
        validateNumber(args[key], key, { min: -1e6, max: 1e6 });
      }
      const code = `
${DOC_PREAMBLE}
wedge_shape = Part.makeWedge(${args.xmin}, ${args.ymin}, ${args.zmin}, ${args.x2min}, ${args.z2min}, ${args.xmax}, ${args.ymax}, ${args.zmax}, ${args.x2max}, ${args.z2max})
wedge_obj = doc.addObject("Part::Feature", "${objName}")
wedge_obj.Shape = wedge_shape
doc.recompute()
_mcp_result["result"] = {"name": wedge_obj.Name, "label": wedge_obj.Label}
`;
      return bridge.run(code);
    }

    case 'freecad_create_helix': {
      const objName = (args.name as string) || 'Helix';
      const pitch = validatePositiveNumber(args.pitch, 'pitch');
      const height = validatePositiveNumber(args.height, 'height');
      const radius = validatePositiveNumber(args.radius, 'radius');
      const angle = validateNumber((args.angle as number) ?? 0, 'angle', { min: -89, max: 89 });
      const leftHanded = (args.leftHanded as boolean) ?? false;
      return bridge.run(`
${DOC_PREAMBLE}
helix = doc.addObject("Part::Helix", ${JSON.stringify(objName)})
helix.Pitch = ${pitch}
helix.Height = ${height}
helix.Radius = ${radius}
helix.Angle = ${angle}
helix.LocalCoord = ${leftHanded ? '1' : '0'}
doc.recompute()
_mcp_result["result"] = {"name": helix.Name, "label": helix.Label, "pitch": ${pitch}, "height": ${height}, "radius": ${radius}}
`);
    }

    case 'freecad_create_spiral': {
      const objName = (args.name as string) || 'Spiral';
      const growth = validatePositiveNumber(args.growth, 'growth');
      const rotations = validatePositiveNumber(args.rotations, 'rotations', 10000);
      const radius = validateNonNegativeNumber(args.radius, 'radius');
      return bridge.run(`
${DOC_PREAMBLE}
spiral = doc.addObject("Part::Spiral", ${JSON.stringify(objName)})
spiral.Growth = ${growth}
spiral.Rotations = ${rotations}
spiral.Radius = ${radius}
doc.recompute()
_mcp_result["result"] = {"name": spiral.Name, "label": spiral.Label, "growth": ${growth}, "rotations": ${rotations}, "radius": ${radius}}
`);
    }

    case 'freecad_create_ellipsoid': {
      const objName = (args.name as string) || 'Ellipsoid';
      const r1 = validatePositiveNumber(args.radius1, 'radius1');
      const r2 = validatePositiveNumber(args.radius2, 'radius2');
      const r3 = validatePositiveNumber((args.radius3 as number) ?? r2, 'radius3');
      return bridge.run(`
${DOC_PREAMBLE}
ell = doc.addObject("Part::Ellipsoid", ${JSON.stringify(objName)})
ell.Radius1 = ${r1}
ell.Radius2 = ${r2}
ell.Radius3 = ${r3}
doc.recompute()
_mcp_result["result"] = {"name": ell.Name, "label": ell.Label, "radius1": ${r1}, "radius2": ${r2}, "radius3": ${r3}}
`);
    }

    case 'freecad_create_tube': {
      const objName = (args.name as string) || 'Tube';
      const outerRadius = validatePositiveNumber(args.outerRadius, 'outerRadius');
      const innerRadius = validatePositiveNumber(args.innerRadius, 'innerRadius');
      const height = validatePositiveNumber(args.height, 'height');
      if (innerRadius >= outerRadius) {
        throw new Error('innerRadius must be less than outerRadius');
      }
      return bridge.run(`
${DOC_PREAMBLE}
outer = Part.makeCylinder(${outerRadius}, ${height})
inner = Part.makeCylinder(${innerRadius}, ${height})
tube_shape = outer.cut(inner)
tube = doc.addObject("Part::Feature", ${JSON.stringify(objName)})
tube.Shape = tube_shape
doc.recompute()
_mcp_result["result"] = {"name": tube.Name, "label": tube.Label, "outerRadius": ${outerRadius}, "innerRadius": ${innerRadius}, "height": ${height}}
`);
    }

    case 'freecad_create_prism': {
      const objName = (args.name as string) || 'Prism';
      const sides = validateNumber(args.sides, 'sides', { min: 3, max: 360 });
      const radius = validatePositiveNumber(args.radius, 'radius');
      const height = validatePositiveNumber(args.height, 'height');
      return bridge.run(`
${DOC_PREAMBLE}
prism = doc.addObject("Part::Prism", ${JSON.stringify(objName)})
prism.Polygon = ${sides}
prism.Circumradius = ${radius}
prism.Height = ${height}
doc.recompute()
_mcp_result["result"] = {"name": prism.Name, "label": prism.Label, "sides": ${sides}, "radius": ${radius}, "height": ${height}}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown primitive tool: ${name}` }],
        isError: true,
      };
  }
}

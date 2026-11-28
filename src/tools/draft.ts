import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { pyBool, validateFilePath, validateToolArgs } from '../validation.js';

const DOC_PREAMBLE = `doc = FreeCAD.ActiveDocument
if doc is None:
    doc = FreeCAD.newDocument("Unnamed")`;

export const DRAFT_TOOLS = [
  {
    name: 'freecad_draft_wire',
    description: 'Create a multi-segment wire (polyline) from a list of points',
    inputSchema: {
      type: 'object' as const,
      properties: {
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
            },
            required: ['x', 'y', 'z'],
          },
          description: 'Array of {x, y, z} points defining the wire',
        },
        closed: { type: 'boolean', description: 'Close the wire (default false)' },
        name: { type: 'string', description: 'Name for the wire object' },
      },
      required: ['points'],
    },
  },
  {
    name: 'freecad_draft_bspline',
    description: 'Create a B-spline curve through a list of points',
    inputSchema: {
      type: 'object' as const,
      properties: {
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
            },
            required: ['x', 'y', 'z'],
          },
          description: 'Array of {x, y, z} control/interpolation points',
        },
        closed: { type: 'boolean', description: 'Close the spline (default false)' },
        name: { type: 'string', description: 'Name for the B-spline object' },
      },
      required: ['points'],
    },
  },
  {
    name: 'freecad_draft_polygon',
    description: 'Create a regular polygon (triangle, hexagon, etc.)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sides: { type: 'number', description: 'Number of sides (3=triangle, 6=hexagon, etc.)' },
        radius: { type: 'number', description: 'Circumscribed circle radius' },
        x: { type: 'number', description: 'Center X position (default 0)' },
        y: { type: 'number', description: 'Center Y position (default 0)' },
        z: { type: 'number', description: 'Center Z position (default 0)' },
        name: { type: 'string', description: 'Name for the polygon object' },
      },
      required: ['sides', 'radius'],
    },
  },
  {
    name: 'freecad_draft_ellipse',
    description: 'Create an ellipse shape',
    inputSchema: {
      type: 'object' as const,
      properties: {
        majorRadius: { type: 'number', description: 'Major (semi) axis radius' },
        minorRadius: { type: 'number', description: 'Minor (semi) axis radius' },
        x: { type: 'number', description: 'Center X position (default 0)' },
        y: { type: 'number', description: 'Center Y position (default 0)' },
        z: { type: 'number', description: 'Center Z position (default 0)' },
        name: { type: 'string', description: 'Name for the ellipse' },
      },
      required: ['majorRadius', 'minorRadius'],
    },
  },
  {
    name: 'freecad_draft_rectangle',
    description: 'Create a Draft rectangle on the XY plane',
    inputSchema: {
      type: 'object' as const,
      properties: {
        width: { type: 'number', description: 'Rectangle width (X direction)' },
        height: { type: 'number', description: 'Rectangle height (Y direction)' },
        x: { type: 'number', description: 'Corner X position (default 0)' },
        y: { type: 'number', description: 'Corner Y position (default 0)' },
        z: { type: 'number', description: 'Corner Z position (default 0)' },
        name: { type: 'string', description: 'Name for the rectangle' },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'freecad_draft_facebinder',
    description: 'Create a face from one or more faces of existing objects',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the source object' },
        faceNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Face names to bind (e.g. ["Face1", "Face2"])',
        },
        name: { type: 'string', description: 'Name for the FaceBinder' },
      },
      required: ['objectName', 'faceNames'],
    },
  },
  {
    name: 'freecad_draft_clone',
    description: 'Create a parametric clone of one or more objects (linked copies that update with the original)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to clone',
        },
        name: { type: 'string', description: 'Name for the clone' },
      },
      required: ['objectNames'],
    },
  },
  {
    name: 'freecad_draft_shapestring',
    description: 'Create 3D text as a wire/face shape from a font file (for engraving, labels, 3D text)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text string to create' },
        size: { type: 'number', description: 'Font size in mm (default 10)' },
        fontFile: { type: 'string', description: 'Absolute path to TTF font file (uses default if omitted)' },
        x: { type: 'number', description: 'X position (default 0)' },
        y: { type: 'number', description: 'Y position (default 0)' },
        z: { type: 'number', description: 'Z position (default 0)' },
        name: { type: 'string', description: 'Name for the ShapeString' },
      },
      required: ['text'],
    },
  },
  {
    name: 'freecad_draft_move',
    description: 'Move (translate) objects with optional copy',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to move',
        },
        x: { type: 'number', description: 'X translation' },
        y: { type: 'number', description: 'Y translation' },
        z: { type: 'number', description: 'Z translation' },
        copy: { type: 'boolean', description: 'Create a copy instead of moving (default false)' },
      },
      required: ['objectNames', 'x', 'y', 'z'],
    },
  },
  {
    name: 'freecad_draft_rotate',
    description: 'Rotate objects around a center point with optional copy',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to rotate',
        },
        angle: { type: 'number', description: 'Rotation angle in degrees' },
        centerX: { type: 'number', description: 'Center of rotation X (default 0)' },
        centerY: { type: 'number', description: 'Center of rotation Y (default 0)' },
        centerZ: { type: 'number', description: 'Center of rotation Z (default 0)' },
        axisX: { type: 'number', description: 'Rotation axis X (default 0)' },
        axisY: { type: 'number', description: 'Rotation axis Y (default 0)' },
        axisZ: { type: 'number', description: 'Rotation axis Z (default 1)' },
        copy: { type: 'boolean', description: 'Create a copy instead of rotating (default false)' },
      },
      required: ['objectNames', 'angle'],
    },
  },
  {
    name: 'freecad_draft_scale',
    description: 'Scale objects from a center point with optional copy',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to scale',
        },
        scaleX: { type: 'number', description: 'Scale factor X' },
        scaleY: { type: 'number', description: 'Scale factor Y (default same as X)' },
        scaleZ: { type: 'number', description: 'Scale factor Z (default same as X)' },
        centerX: { type: 'number', description: 'Center of scale X (default 0)' },
        centerY: { type: 'number', description: 'Center of scale Y (default 0)' },
        centerZ: { type: 'number', description: 'Center of scale Z (default 0)' },
        copy: { type: 'boolean', description: 'Create a copy (default true)' },
      },
      required: ['objectNames', 'scaleX'],
    },
  },
  {
    name: 'freecad_draft_offset',
    description: 'Offset a 2D wire/edge by a distance (inward or outward)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the wire/edge to offset' },
        distance: { type: 'number', description: 'Offset distance (positive = outward, negative = inward)' },
        copy: { type: 'boolean', description: 'Create a copy (default true)' },
      },
      required: ['objectName', 'distance'],
    },
  },
  {
    name: 'freecad_draft_upgrade',
    description: 'Upgrade objects: join wires into faces, faces into shells/solids',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to upgrade',
        },
      },
      required: ['objectNames'],
    },
  },
  {
    name: 'freecad_draft_downgrade',
    description: 'Downgrade objects: split solids into faces, faces into wires, wires into edges',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of objects to downgrade',
        },
      },
      required: ['objectNames'],
    },
  },
  {
    name: 'freecad_draft_path_array',
    description: 'Distribute copies of an object along a path/wire',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the object to array' },
        pathName: { type: 'string', description: 'Name of the path wire/edge' },
        count: { type: 'number', description: 'Number of copies along the path' },
        name: { type: 'string', description: 'Name for the array' },
      },
      required: ['objectName', 'pathName', 'count'],
    },
  },
  {
    name: 'freecad_draft_dimension',
    description: 'Add a dimension annotation between two points',
    inputSchema: {
      type: 'object' as const,
      properties: {
        point1X: { type: 'number', description: 'First point X' },
        point1Y: { type: 'number', description: 'First point Y' },
        point1Z: { type: 'number', description: 'First point Z (default 0)' },
        point2X: { type: 'number', description: 'Second point X' },
        point2Y: { type: 'number', description: 'Second point Y' },
        point2Z: { type: 'number', description: 'Second point Z (default 0)' },
        name: { type: 'string', description: 'Name for the dimension' },
      },
      required: ['point1X', 'point1Y', 'point2X', 'point2Y'],
    },
  },
  {
    name: 'freecad_draft_shape2dview',
    description: 'Project a 3D object to a 2D view (flattened projection for technical drawings)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectName: { type: 'string', description: 'Name of the 3D object to project' },
        directionX: { type: 'number', description: 'Projection direction X (default 0)' },
        directionY: { type: 'number', description: 'Projection direction Y (default 0)' },
        directionZ: { type: 'number', description: 'Projection direction Z (default -1, i.e., top view)' },
        name: { type: 'string', description: 'Name for the 2D view' },
      },
      required: ['objectName'],
    },
  },
];

export async function handleDraftTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  validateToolArgs(DRAFT_TOOLS, name, args);
  switch (name) {
    case 'freecad_draft_wire': {
      const points = args.points as Array<{ x: number; y: number; z: number }>;
      const closed = (args.closed as boolean) ?? false;
      const wireName = (args.name as string) || 'Wire';
      const pointsList = points.map(p => `FreeCAD.Vector(${p.x}, ${p.y}, ${p.z})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
pts = [${pointsList}]
wire = Draft.make_wire(pts, closed=${pyBool(closed)}, face=False)
wire.Label = ${JSON.stringify(wireName)}
doc.recompute()
_mcp_result["result"] = {"name": wire.Name, "label": wire.Label, "points": ${points.length}, "closed": wire.Closed}
`);
    }

    case 'freecad_draft_bspline': {
      const points = args.points as Array<{ x: number; y: number; z: number }>;
      const closed = (args.closed as boolean) ?? false;
      const bsName = (args.name as string) || 'BSpline';
      const pointsList = points.map(p => `FreeCAD.Vector(${p.x}, ${p.y}, ${p.z})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
pts = [${pointsList}]
bsp = Draft.make_bspline(pts, closed=${pyBool(closed)})
bsp.Label = ${JSON.stringify(bsName)}
doc.recompute()
_mcp_result["result"] = {"name": bsp.Name, "label": bsp.Label, "points": ${points.length}, "closed": bsp.Closed}
`);
    }

    case 'freecad_draft_polygon': {
      const sides = args.sides as number;
      const radius = args.radius as number;
      const x = (args.x as number) ?? 0;
      const y = (args.y as number) ?? 0;
      const z = (args.z as number) ?? 0;
      const polyName = (args.name as string) || 'Polygon';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
poly = Draft.make_polygon(${sides}, ${radius})
poly.Label = ${JSON.stringify(polyName)}
poly.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
doc.recompute()
_mcp_result["result"] = {"name": poly.Name, "label": poly.Label, "sides": ${sides}, "radius": ${radius}}
`);
    }

    case 'freecad_draft_ellipse': {
      const majorRadius = args.majorRadius as number;
      const minorRadius = args.minorRadius as number;
      const x = (args.x as number) ?? 0;
      const y = (args.y as number) ?? 0;
      const z = (args.z as number) ?? 0;
      const ellName = (args.name as string) || 'Ellipse';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
ell = Draft.make_ellipse(${majorRadius * 2}, ${minorRadius * 2})
ell.Label = ${JSON.stringify(ellName)}
ell.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
doc.recompute()
_mcp_result["result"] = {"name": ell.Name, "label": ell.Label, "majorRadius": ${majorRadius}, "minorRadius": ${minorRadius}}
`);
    }

    case 'freecad_draft_rectangle': {
      const width = args.width as number;
      const height = args.height as number;
      const x = (args.x as number) ?? 0;
      const y = (args.y as number) ?? 0;
      const z = (args.z as number) ?? 0;
      const rectName = (args.name as string) || 'Rectangle';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
rect = Draft.make_rectangle(${width}, ${height})
rect.Label = ${JSON.stringify(rectName)}
rect.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
doc.recompute()
_mcp_result["result"] = {"name": rect.Name, "label": rect.Label, "width": ${width}, "height": ${height}}
`);
    }

    case 'freecad_draft_facebinder': {
      const objectName = args.objectName as string;
      const faceNames = args.faceNames as string[];
      const fbName = (args.name as string) || 'FaceBinder';
      return bridge.run(`
${DOC_PREAMBLE}
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
fb = doc.addObject("Part::FeaturePython", ${JSON.stringify(fbName)})
import Draft
fb_obj = Draft.make_facebinder([(obj, (${faceNames.map(f => JSON.stringify(f)).join(', ')},))])
fb_obj.Label = ${JSON.stringify(fbName)}
doc.recompute()
_mcp_result["result"] = {"name": fb_obj.Name, "label": fb_obj.Label, "faces": ${JSON.stringify(faceNames)}}
`);
    }

    case 'freecad_draft_clone': {
      const objectNames = args.objectNames as string[];
      const cloneName = (args.name as string) || 'Clone';
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
missing = [${JSON.stringify(objectNames)}[i] for i, o in enumerate(objs) if o is None]
if missing:
    raise ValueError(f"Objects not found: {missing}")
clone = Draft.make_clone(objs)
clone.Label = ${JSON.stringify(cloneName)}
doc.recompute()
_mcp_result["result"] = {"name": clone.Name, "label": clone.Label, "sources": ${JSON.stringify(objectNames)}}
`);
    }

    case 'freecad_draft_shapestring': {
      const text = args.text as string;
      const size = (args.size as number) ?? 10;
      const fontFile = args.fontFile === undefined ? undefined : validateFilePath(args.fontFile, 'fontFile');
      const x = (args.x as number) ?? 0;
      const y = (args.y as number) ?? 0;
      const z = (args.z as number) ?? 0;
      const ssName = (args.name as string) || 'ShapeString';
      const fontCode = fontFile
        ? JSON.stringify(fontFile)
        : `"/System/Library/Fonts/Helvetica.ttc"`;
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
import os
font = ${fontCode}
if not os.path.exists(font):
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    if not os.path.exists(font):
        font = ""
ss = Draft.make_shapestring(${JSON.stringify(text)}, font, ${size})
ss.Label = ${JSON.stringify(ssName)}
ss.Placement.Base = FreeCAD.Vector(${x}, ${y}, ${z})
doc.recompute()
_mcp_result["result"] = {"name": ss.Name, "label": ss.Label, "text": ${JSON.stringify(text)}, "size": ${size}}
`);
    }

    case 'freecad_draft_move': {
      const objectNames = args.objectNames as string[];
      const x = args.x as number;
      const y = args.y as number;
      const z = args.z as number;
      const copy = (args.copy as boolean) ?? false;
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
result = Draft.move(objs, FreeCAD.Vector(${x}, ${y}, ${z}), copy=${pyBool(copy)})
doc.recompute()
moved = [r.Name for r in (result if isinstance(result, list) else [result])] if result else ${JSON.stringify(objectNames)}
_mcp_result["result"] = {"moved": moved, "vector": {"x": ${x}, "y": ${y}, "z": ${z}}, "copy": ${pyBool(copy)}}
`);
    }

    case 'freecad_draft_rotate': {
      const objectNames = args.objectNames as string[];
      const angle = args.angle as number;
      const cx = (args.centerX as number) ?? 0;
      const cy = (args.centerY as number) ?? 0;
      const cz = (args.centerZ as number) ?? 0;
      const ax = (args.axisX as number) ?? 0;
      const ay = (args.axisY as number) ?? 0;
      const az = (args.axisZ as number) ?? 1;
      const copy = (args.copy as boolean) ?? false;
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
result = Draft.rotate(objs, ${angle}, FreeCAD.Vector(${cx}, ${cy}, ${cz}), FreeCAD.Vector(${ax}, ${ay}, ${az}), copy=${pyBool(copy)})
doc.recompute()
rotated = [r.Name for r in (result if isinstance(result, list) else [result])] if result else ${JSON.stringify(objectNames)}
_mcp_result["result"] = {"rotated": rotated, "angle": ${angle}, "copy": ${pyBool(copy)}}
`);
    }

    case 'freecad_draft_scale': {
      const objectNames = args.objectNames as string[];
      const scaleX = args.scaleX as number;
      const scaleY = (args.scaleY as number) ?? scaleX;
      const scaleZ = (args.scaleZ as number) ?? scaleX;
      const cx = (args.centerX as number) ?? 0;
      const cy = (args.centerY as number) ?? 0;
      const cz = (args.centerZ as number) ?? 0;
      const copy = (args.copy as boolean) ?? true;
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
result = Draft.scale(objs, FreeCAD.Vector(${scaleX}, ${scaleY}, ${scaleZ}), FreeCAD.Vector(${cx}, ${cy}, ${cz}), copy=${pyBool(copy)})
doc.recompute()
scaled = [r.Name for r in (result if isinstance(result, list) else [result])] if result else ${JSON.stringify(objectNames)}
_mcp_result["result"] = {"scaled": scaled, "scale": {"x": ${scaleX}, "y": ${scaleY}, "z": ${scaleZ}}, "copy": ${pyBool(copy)}}
`);
    }

    case 'freecad_draft_offset': {
      const objectName = args.objectName as string;
      const distance = args.distance as number;
      const copy = (args.copy as boolean) ?? true;
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
result = Draft.offset(obj, FreeCAD.Vector(${distance}, 0, 0), copy=${pyBool(copy)})
doc.recompute()
_mcp_result["result"] = {"name": result.Name if result else ${JSON.stringify(objectName)}, "distance": ${distance}, "copy": ${pyBool(copy)}}
`);
    }

    case 'freecad_draft_upgrade': {
      const objectNames = args.objectNames as string[];
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
result = Draft.upgrade(objs)
doc.recompute()
added = [o.Name for o in result[0]] if result and result[0] else []
deleted = [o.Name for o in result[1]] if result and len(result) > 1 and result[1] else []
_mcp_result["result"] = {"added": added, "deleted": deleted}
`);
    }

    case 'freecad_draft_downgrade': {
      const objectNames = args.objectNames as string[];
      const objsCode = objectNames.map(n => `doc.getObject(${JSON.stringify(n)})`).join(', ');
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
objs = [${objsCode}]
result = Draft.downgrade(objs)
doc.recompute()
added = [o.Name for o in result[0]] if result and result[0] else []
deleted = [o.Name for o in result[1]] if result and len(result) > 1 and result[1] else []
_mcp_result["result"] = {"added": added, "deleted": deleted}
`);
    }

    case 'freecad_draft_path_array': {
      const objectName = args.objectName as string;
      const pathName = args.pathName as string;
      const count = args.count as number;
      const arrName = (args.name as string) || 'PathArray';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
obj = doc.getObject(${JSON.stringify(objectName)})
path = doc.getObject(${JSON.stringify(pathName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
if path is None:
    raise ValueError("Path not found: " + ${JSON.stringify(pathName)})
arr = Draft.make_path_array(obj, path, ${count})
arr.Label = ${JSON.stringify(arrName)}
doc.recompute()
_mcp_result["result"] = {"name": arr.Name, "label": arr.Label, "count": ${count}, "path": ${JSON.stringify(pathName)}}
`);
    }

    case 'freecad_draft_dimension': {
      const p1x = args.point1X as number;
      const p1y = args.point1Y as number;
      const p1z = (args.point1Z as number) ?? 0;
      const p2x = args.point2X as number;
      const p2y = args.point2Y as number;
      const p2z = (args.point2Z as number) ?? 0;
      const dimName = (args.name as string) || 'Dimension';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
p1 = FreeCAD.Vector(${p1x}, ${p1y}, ${p1z})
p2 = FreeCAD.Vector(${p2x}, ${p2y}, ${p2z})
mid = (p1 + p2) * 0.5
mid.z += 5
dim = Draft.make_dimension(p1, p2, mid)
dim.Label = ${JSON.stringify(dimName)}
doc.recompute()
dist = p1.distanceToPoint(p2)
_mcp_result["result"] = {"name": dim.Name, "label": dim.Label, "distance": dist}
`);
    }

    case 'freecad_draft_shape2dview': {
      const objectName = args.objectName as string;
      const dx = (args.directionX as number) ?? 0;
      const dy = (args.directionY as number) ?? 0;
      const dz = (args.directionZ as number) ?? -1;
      const viewName = (args.name as string) || 'Shape2DView';
      return bridge.run(`
${DOC_PREAMBLE}
import Draft
obj = doc.getObject(${JSON.stringify(objectName)})
if obj is None:
    raise ValueError("Object not found: " + ${JSON.stringify(objectName)})
view = Draft.make_shape2dview(obj, FreeCAD.Vector(${dx}, ${dy}, ${dz}))
view.Label = ${JSON.stringify(viewName)}
doc.recompute()
_mcp_result["result"] = {"name": view.Name, "label": view.Label, "source": ${JSON.stringify(objectName)}}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown draft tool: ${name}` }],
        isError: true,
      };
  }
}

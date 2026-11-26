import { FreeCADBridge } from '../freecad-bridge.js';
import { ToolResult, ToolArgs } from '../types.js';
import { pyBool } from '../validation.js';

export const SKETCHER_TOOLS = [
  {
    name: 'freecad_create_sketch',
    description: 'Create a new sketch on a plane (XY, XZ, or YZ)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the sketch (default: "Sketch")' },
        plane: {
          type: 'string',
          enum: ['XY', 'XZ', 'YZ'],
          description: 'Plane to create the sketch on (default: "XY")',
        },
      },
      required: [],
    },
  },
  {
    name: 'freecad_add_sketch_line',
    description: 'Add a line segment to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        x1: { type: 'number', description: 'Start point X coordinate' },
        y1: { type: 'number', description: 'Start point Y coordinate' },
        x2: { type: 'number', description: 'End point X coordinate' },
        y2: { type: 'number', description: 'End point Y coordinate' },
      },
      required: ['sketchName', 'x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'freecad_add_sketch_circle',
    description: 'Add a circle to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        centerX: { type: 'number', description: 'Center X coordinate' },
        centerY: { type: 'number', description: 'Center Y coordinate' },
        radius: { type: 'number', description: 'Circle radius' },
      },
      required: ['sketchName', 'centerX', 'centerY', 'radius'],
    },
  },
  {
    name: 'freecad_add_sketch_arc',
    description: 'Add an arc to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        centerX: { type: 'number', description: 'Center X coordinate' },
        centerY: { type: 'number', description: 'Center Y coordinate' },
        radius: { type: 'number', description: 'Arc radius' },
        startAngle: { type: 'number', description: 'Start angle in degrees' },
        endAngle: { type: 'number', description: 'End angle in degrees' },
      },
      required: ['sketchName', 'centerX', 'centerY', 'radius', 'startAngle', 'endAngle'],
    },
  },
  {
    name: 'freecad_add_sketch_rectangle',
    description: 'Add a rectangle to a sketch (4 lines with coincidence constraints)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        x1: { type: 'number', description: 'First corner X coordinate' },
        y1: { type: 'number', description: 'First corner Y coordinate' },
        x2: { type: 'number', description: 'Opposite corner X coordinate' },
        y2: { type: 'number', description: 'Opposite corner Y coordinate' },
      },
      required: ['sketchName', 'x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'freecad_add_sketch_constraint',
    description: 'Add a constraint to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        constraintType: {
          type: 'string',
          enum: [
            'coincident',
            'horizontal',
            'vertical',
            'fixed',
            'distance',
            'distanceX',
            'distanceY',
            'radius',
            'diameter',
            'angle',
            'equal',
            'tangent',
            'perpendicular',
            'parallel',
            'pointOnObject',
            'symmetric',
          ],
          description: 'Type of constraint to add',
        },
        index1: { type: 'number', description: 'Index of the first geometry element' },
        index2: { type: 'number', description: 'Index of the second geometry element (for two-element constraints)' },
        value: { type: 'number', description: 'Value for dimensional constraints (e.g., distance)' },
      },
      required: ['sketchName', 'constraintType', 'index1'],
    },
  },
  {
    name: 'freecad_add_sketch_ellipse',
    description: 'Add an ellipse to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        centerX: { type: 'number', description: 'Center X coordinate' },
        centerY: { type: 'number', description: 'Center Y coordinate' },
        majorRadius: { type: 'number', description: 'Semi-major axis radius' },
        minorRadius: { type: 'number', description: 'Semi-minor axis radius' },
      },
      required: ['sketchName', 'centerX', 'centerY', 'majorRadius', 'minorRadius'],
    },
  },
  {
    name: 'freecad_add_sketch_bspline',
    description: 'Add a B-spline curve to a sketch through control points',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          description: 'Array of {x, y} control points',
        },
        closed: { type: 'boolean', description: 'Close the B-spline (default false)' },
      },
      required: ['sketchName', 'points'],
    },
  },
  {
    name: 'freecad_add_sketch_polygon',
    description: 'Add a regular polygon to a sketch (equilateral triangle, square, hexagon, etc.)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        centerX: { type: 'number', description: 'Center X coordinate' },
        centerY: { type: 'number', description: 'Center Y coordinate' },
        radius: { type: 'number', description: 'Circumscribed circle radius' },
        sides: { type: 'number', description: 'Number of sides (3=triangle, 4=square, 6=hexagon, etc.)' },
      },
      required: ['sketchName', 'centerX', 'centerY', 'radius', 'sides'],
    },
  },
  {
    name: 'freecad_add_sketch_slot',
    description: 'Add a slot (oblong/stadium shape) to a sketch — a rectangle with semicircular ends',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        x1: { type: 'number', description: 'First center X coordinate' },
        y1: { type: 'number', description: 'First center Y coordinate' },
        x2: { type: 'number', description: 'Second center X coordinate' },
        y2: { type: 'number', description: 'Second center Y coordinate' },
        width: { type: 'number', description: 'Slot width (diameter of the semicircular ends)' },
      },
      required: ['sketchName', 'x1', 'y1', 'x2', 'y2', 'width'],
    },
  },
  {
    name: 'freecad_add_sketch_point',
    description: 'Add a construction/reference point to a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        x: { type: 'number', description: 'Point X coordinate' },
        y: { type: 'number', description: 'Point Y coordinate' },
      },
      required: ['sketchName', 'x', 'y'],
    },
  },
  {
    name: 'freecad_add_sketch_external',
    description: 'Add external geometry reference to a sketch (project an edge from another object into the sketch for constraining)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        objectName: { type: 'string', description: 'Name of the external object' },
        edgeName: { type: 'string', description: 'Edge reference (e.g., "Edge1")' },
      },
      required: ['sketchName', 'objectName', 'edgeName'],
    },
  },
  {
    name: 'freecad_sketch_fillet',
    description: 'Create a fillet (rounded corner) at a vertex in a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        vertexIndex: { type: 'number', description: 'Index of the vertex to fillet' },
        radius: { type: 'number', description: 'Fillet radius' },
      },
      required: ['sketchName', 'vertexIndex', 'radius'],
    },
  },
  {
    name: 'freecad_sketch_trim',
    description: 'Trim (cut away) part of a geometry element at intersection points',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        geoIndex: { type: 'number', description: 'Index of the geometry element to trim' },
        posX: { type: 'number', description: 'X coordinate of point near the part to remove' },
        posY: { type: 'number', description: 'Y coordinate of point near the part to remove' },
      },
      required: ['sketchName', 'geoIndex', 'posX', 'posY'],
    },
  },
  {
    name: 'freecad_sketch_toggle_construction',
    description: 'Toggle a geometry element between construction mode and regular mode. Construction geometry is used for reference only.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch' },
        geoIndex: { type: 'number', description: 'Index of the geometry element to toggle' },
      },
      required: ['sketchName', 'geoIndex'],
    },
  },
  {
    name: 'freecad_close_sketch',
    description: 'Close and recompute a sketch',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sketchName: { type: 'string', description: 'Name of the sketch to close/recompute' },
      },
      required: ['sketchName'],
    },
  },
];

export async function handleSketcherTool(
  name: string,
  args: ToolArgs,
  bridge: FreeCADBridge,
): Promise<ToolResult> {
  switch (name) {
    case 'freecad_create_sketch': {
      const sketchName = (args.name as string) || 'Sketch';
      const plane = (args.plane as string) || 'XY';

      const planeMap: Record<string, string> = {
        XY: 'FreeCAD.Vector(0, 0, 1)',
        XZ: 'FreeCAD.Vector(0, 1, 0)',
        YZ: 'FreeCAD.Vector(1, 0, 0)',
      };
      const planeNormal = planeMap[plane] || planeMap['XY'];

      // For XZ plane, rotate -90 degrees around X axis
      // For YZ plane, rotate 90 degrees around Y axis
      const placementMap: Record<string, string> = {
        XY: 'FreeCAD.Placement(FreeCAD.Vector(0,0,0), FreeCAD.Rotation(FreeCAD.Vector(0,0,1), 0))',
        XZ: 'FreeCAD.Placement(FreeCAD.Vector(0,0,0), FreeCAD.Rotation(FreeCAD.Vector(1,0,0), -90))',
        YZ: 'FreeCAD.Placement(FreeCAD.Vector(0,0,0), FreeCAD.Rotation(FreeCAD.Vector(0,1,0), 90))',
      };
      const placement = placementMap[plane] || placementMap['XY'];

      return bridge.run(`
import Sketcher
doc = FreeCAD.ActiveDocument
sketch = doc.addObject("Sketcher::SketchObject", ${JSON.stringify(sketchName)})
sketch.MapMode = "Deactivated"
sketch.Placement = ${placement}
doc.recompute()
_mcp_result["result"] = {"name": sketch.Name, "plane": ${JSON.stringify(plane)}}
`);
    }

    case 'freecad_add_sketch_line': {
      const sketchName = args.sketchName as string;
      const x1 = args.x1 as number;
      const y1 = args.y1 as number;
      const x2 = args.x2 as number;
      const y2 = args.y2 as number;

      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
idx = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(${x1}, ${y1}, 0), FreeCAD.Vector(${x2}, ${y2}, 0)))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx}
`);
    }

    case 'freecad_add_sketch_circle': {
      const sketchName = args.sketchName as string;
      const cx = args.centerX as number;
      const cy = args.centerY as number;
      const radius = args.radius as number;

      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
idx = sketch.addGeometry(Part.Circle(FreeCAD.Vector(${cx}, ${cy}, 0), FreeCAD.Vector(0, 0, 1), ${radius}))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx}
`);
    }

    case 'freecad_add_sketch_arc': {
      const sketchName = args.sketchName as string;
      const cx = args.centerX as number;
      const cy = args.centerY as number;
      const radius = args.radius as number;
      const startAngle = args.startAngle as number;
      const endAngle = args.endAngle as number;

      return bridge.run(`
import math
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
circle = Part.Circle(FreeCAD.Vector(${cx}, ${cy}, 0), FreeCAD.Vector(0, 0, 1), ${radius})
arc = Part.ArcOfCircle(circle, math.radians(${startAngle}), math.radians(${endAngle}))
idx = sketch.addGeometry(arc)
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx}
`);
    }

    case 'freecad_add_sketch_rectangle': {
      const sketchName = args.sketchName as string;
      const x1 = args.x1 as number;
      const y1 = args.y1 as number;
      const x2 = args.x2 as number;
      const y2 = args.y2 as number;

      return bridge.run(`
import Sketcher
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
# Add 4 line segments: bottom, right, top, left
i0 = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(${x1}, ${y1}, 0), FreeCAD.Vector(${x2}, ${y1}, 0)))
i1 = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(${x2}, ${y1}, 0), FreeCAD.Vector(${x2}, ${y2}, 0)))
i2 = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(${x2}, ${y2}, 0), FreeCAD.Vector(${x1}, ${y2}, 0)))
i3 = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(${x1}, ${y2}, 0), FreeCAD.Vector(${x1}, ${y1}, 0)))
# Add coincidence constraints to close the rectangle
# bottom-end to right-start
sketch.addConstraint(Sketcher.Constraint("Coincident", i0, 2, i1, 1))
# right-end to top-start
sketch.addConstraint(Sketcher.Constraint("Coincident", i1, 2, i2, 1))
# top-end to left-start
sketch.addConstraint(Sketcher.Constraint("Coincident", i2, 2, i3, 1))
# left-end to bottom-start
sketch.addConstraint(Sketcher.Constraint("Coincident", i3, 2, i0, 1))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndices": [i0, i1, i2, i3]}
`);
    }

    case 'freecad_add_sketch_constraint': {
      const sketchName = args.sketchName as string;
      const constraintType = args.constraintType as string;
      const index1 = args.index1 as number;
      const index2 = args.index2 as number | undefined;
      const value = args.value as number | undefined;

      // Map user-friendly names to FreeCAD constraint names
      const constraintNameMap: Record<string, string> = {
        coincident: 'Coincident',
        horizontal: 'Horizontal',
        vertical: 'Vertical',
        fixed: 'Block',
        distance: 'Distance',
        distanceX: 'DistanceX',
        distanceY: 'DistanceY',
        radius: 'Radius',
        diameter: 'Diameter',
        angle: 'Angle',
        equal: 'Equal',
        tangent: 'Tangent',
        perpendicular: 'Perpendicular',
        parallel: 'Parallel',
        pointOnObject: 'PointOnObject',
        symmetric: 'Symmetric',
      };
      const fcConstraint = constraintNameMap[constraintType] || constraintType;

      // Build constraint arguments based on what's provided
      let constraintArgs: string;
      if (value !== undefined && index2 !== undefined) {
        constraintArgs = `${JSON.stringify(fcConstraint)}, ${index1}, ${index2}, ${value}`;
      } else if (index2 !== undefined) {
        constraintArgs = `${JSON.stringify(fcConstraint)}, ${index1}, ${index2}`;
      } else if (value !== undefined) {
        constraintArgs = `${JSON.stringify(fcConstraint)}, ${index1}, ${value}`;
      } else {
        constraintArgs = `${JSON.stringify(fcConstraint)}, ${index1}`;
      }

      return bridge.run(`
import Sketcher
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
cid = sketch.addConstraint(Sketcher.Constraint(${constraintArgs}))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "constraintIndex": cid, "type": ${JSON.stringify(constraintType)}}
`);
    }

    case 'freecad_add_sketch_ellipse': {
      const sketchName = args.sketchName as string;
      const cx = args.centerX as number;
      const cy = args.centerY as number;
      const majorRadius = args.majorRadius as number;
      const minorRadius = args.minorRadius as number;

      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
import Part
ellipse = Part.Ellipse(FreeCAD.Vector(${cx}, ${cy}, 0), ${majorRadius}, ${minorRadius})
idx = sketch.addGeometry(ellipse)
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx, "majorRadius": ${majorRadius}, "minorRadius": ${minorRadius}}
`);
    }

    case 'freecad_add_sketch_bspline': {
      const sketchName = args.sketchName as string;
      const points = args.points as Array<{ x: number; y: number }>;
      const closed = (args.closed as boolean) ?? false;
      const pointsList = points.map(p => `FreeCAD.Vector(${p.x}, ${p.y}, 0)`).join(', ');

      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
import Part
pts = [${pointsList}]
bspline = Part.BSplineCurve()
bspline.interpolate(pts, PeriodicFlag=${closed ? 'True' : 'False'})
idx = sketch.addGeometry(bspline)
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx, "points": ${points.length}, "closed": ${pyBool(closed)}}
`);
    }

    case 'freecad_add_sketch_polygon': {
      const sketchName = args.sketchName as string;
      const cx = args.centerX as number;
      const cy = args.centerY as number;
      const radius = args.radius as number;
      const sides = args.sides as number;

      return bridge.run(`
import math, Sketcher
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
n = ${sides}
r = ${radius}
cx, cy = ${cx}, ${cy}
indices = []
for i in range(n):
    angle1 = 2 * math.pi * i / n
    angle2 = 2 * math.pi * ((i + 1) % n) / n
    x1 = cx + r * math.cos(angle1)
    y1 = cy + r * math.sin(angle1)
    x2 = cx + r * math.cos(angle2)
    y2 = cy + r * math.sin(angle2)
    idx = sketch.addGeometry(Part.LineSegment(FreeCAD.Vector(x1, y1, 0), FreeCAD.Vector(x2, y2, 0)))
    indices.append(idx)
# Close with coincidence constraints
for i in range(n):
    j = (i + 1) % n
    sketch.addConstraint(Sketcher.Constraint("Coincident", indices[i], 2, indices[j], 1))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndices": indices, "sides": n}
`);
    }

    case 'freecad_add_sketch_slot': {
      const sketchName = args.sketchName as string;
      const x1 = args.x1 as number;
      const y1 = args.y1 as number;
      const x2 = args.x2 as number;
      const y2 = args.y2 as number;
      const width = args.width as number;

      return bridge.run(`
import math, Sketcher
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
# Compute slot geometry
dx = ${x2} - ${x1}
dy = ${y2} - ${y1}
length = math.sqrt(dx*dx + dy*dy)
if length < 1e-6:
    raise ValueError("Slot centers must be different points")
# Normal direction for offset
nx = -dy / length * ${width} / 2
ny = dx / length * ${width} / 2
angle_base = math.atan2(dy, dx)
# Create two lines and two arcs
# Top line
l1 = sketch.addGeometry(Part.LineSegment(
    FreeCAD.Vector(${x1}+nx, ${y1}+ny, 0),
    FreeCAD.Vector(${x2}+nx, ${y2}+ny, 0)))
# Bottom line
l2 = sketch.addGeometry(Part.LineSegment(
    FreeCAD.Vector(${x2}-nx, ${y2}-ny, 0),
    FreeCAD.Vector(${x1}-nx, ${y1}-ny, 0)))
# Right semicircle
a1 = sketch.addGeometry(Part.ArcOfCircle(
    Part.Circle(FreeCAD.Vector(${x2}, ${y2}, 0), FreeCAD.Vector(0,0,1), ${width}/2),
    angle_base - math.pi/2, angle_base + math.pi/2))
# Left semicircle
a2 = sketch.addGeometry(Part.ArcOfCircle(
    Part.Circle(FreeCAD.Vector(${x1}, ${y1}, 0), FreeCAD.Vector(0,0,1), ${width}/2),
    angle_base + math.pi/2, angle_base + 3*math.pi/2))
# Connect with coincidence
sketch.addConstraint(Sketcher.Constraint("Coincident", l1, 2, a1, 1))
sketch.addConstraint(Sketcher.Constraint("Coincident", a1, 2, l2, 1))
sketch.addConstraint(Sketcher.Constraint("Coincident", l2, 2, a2, 1))
sketch.addConstraint(Sketcher.Constraint("Coincident", a2, 2, l1, 1))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndices": [l1, l2, a1, a2], "width": ${width}}
`);
    }

    case 'freecad_add_sketch_point': {
      const sketchName = args.sketchName as string;
      const x = args.x as number;
      const y = args.y as number;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
idx = sketch.addGeometry(Part.Point(FreeCAD.Vector(${x}, ${y}, 0)))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryIndex": idx}
`);
    }

    case 'freecad_add_sketch_external': {
      const sketchName = args.sketchName as string;
      const objectName = args.objectName as string;
      const edgeName = args.edgeName as string;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
sketch.addExternal(${JSON.stringify(objectName)}, ${JSON.stringify(edgeName)})
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "external": ${JSON.stringify(objectName)}, "edge": ${JSON.stringify(edgeName)}}
`);
    }

    case 'freecad_sketch_fillet': {
      const sketchName = args.sketchName as string;
      const vertexIndex = args.vertexIndex as number;
      const radius = args.radius as number;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
geo_id, pos_id = sketch.getGeoVertexIndex(${vertexIndex})
idx = sketch.fillet(geo_id, pos_id, ${radius})
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "filletIndex": idx, "radius": ${radius}}
`);
    }

    case 'freecad_sketch_trim': {
      const sketchName = args.sketchName as string;
      const geoIndex = args.geoIndex as number;
      const posX = args.posX as number;
      const posY = args.posY as number;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
sketch.trim(${geoIndex}, FreeCAD.Vector(${posX}, ${posY}, 0))
doc.recompute()
_mcp_result["result"] = {"sketchName": sketch.Name, "trimmedGeoIndex": ${geoIndex}}
`);
    }

    case 'freecad_sketch_toggle_construction': {
      const sketchName = args.sketchName as string;
      const geoIndex = args.geoIndex as number;
      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
sketch.toggleConstruction(${geoIndex})
doc.recompute()
is_construction = sketch.getConstruction(${geoIndex})
_mcp_result["result"] = {"sketchName": sketch.Name, "geoIndex": ${geoIndex}, "isConstruction": is_construction}
`);
    }

    case 'freecad_close_sketch': {
      const sketchName = args.sketchName as string;

      return bridge.run(`
doc = FreeCAD.ActiveDocument
sketch = doc.getObject(${JSON.stringify(sketchName)})
doc.recompute()
geo_count = sketch.GeometryCount
constraint_count = sketch.ConstraintCount
_mcp_result["result"] = {"sketchName": sketch.Name, "geometryCount": geo_count, "constraintCount": constraint_count, "status": "closed"}
`);
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown sketcher tool: ${name}` }],
        isError: true,
      };
  }
}

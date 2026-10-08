import {
  SvgResizeError,
  type AnalyzeOptions,
  type Analysis,
  type Bounds,
  type Feature,
  type Matrix,
  type Point,
} from './types.js';
import { mul, point } from './matrix.js';
import { bounds, flatten, isClosed, transformPath, type Contour } from './path.js';
import { readSvg, type Document, type Shape } from './svg.js';
import { area, boxContains, enclosed, rectangle, cross } from './geometry.js';
export interface Outline {
  shape: Shape;
  subpath: number;
  world: Contour;
  polygon: Point[];
  bounds: Bounds;
  parent?: Outline;
  depth: number;
  matrix: Matrix;
}
export interface Found {
  feature: Feature;
  outline: Outline;
  anchor: Point;
  vertices?: number[];
}
export interface Prepared {
  document: Document;
  outlines: Outline[];
  found: Found[];
  tolerance: number;
}
const center = (b: Bounds): Point => [b.x + b.width / 2, b.y + b.height / 2];
export function prepare(svg: string, options: AnalyzeOptions = {}): Prepared {
  const tolerance = options.tolerance ?? 0.02;
  if (!Number.isFinite(tolerance) || tolerance < 0.0001 || tolerance > 1)
    throw new SvgResizeError('INVALID_OPTIONS', 'tolerance must be between 0.0001 and 1 mm.');
  const document = readSvg(svg),
    outlines: Outline[] = [],
    found: Found[] = [];
  let sampleCount = 0;
  for (const shape of document.shapes) {
    const explicit = shape.resize === 'hole' || shape.resize === 'slot';
    // Engraving and scoring geometry must never become fixed-size cut features.
    // Keep it in the document so it receives the ordinary export transform.
    if (
      shape.resize === 'scale' ||
      (!explicit && ['engrave', 'score'].includes(shape.operation ?? ''))
    )
      continue;
    const matrix = mul(document.viewport, shape.matrix);
    for (let subpath = 0; subpath < shape.paths.length; subpath++) {
      const path = shape.paths[subpath];
      if (!isClosed(path)) continue;
      const world = transformPath(path, matrix),
        polygon = flatten(world, tolerance);
      if (polygon.length < 3) continue;
      sampleCount += polygon.length;
      if (sampleCount > 100000 || outlines.length >= 2000)
        throw new SvgResizeError('COMPLEXITY_LIMIT', 'SVG exceeds the contour analysis budget.');
      outlines.push({ shape, subpath, world, polygon, bounds: bounds(world), depth: 0, matrix });
    }
  }
  let work = 0;
  const spend = (a: Outline, b: Outline) => {
    work += a.polygon.length * b.polygon.length;
    if (work > 20_000_000)
      throw new SvgResizeError(
        'COMPLEXITY_LIMIT',
        'SVG exceeds the containment analysis budget. Simplify the input.',
      );
  };
  const sorted = [...outlines].sort(
    (a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height,
  );
  for (const child of sorted) {
    for (const parent of sorted) {
      if (
        parent === child ||
        parent.bounds.width * parent.bounds.height <= child.bounds.width * child.bounds.height ||
        !boxContains(parent.bounds, child.bounds)
      )
        continue;
      spend(parent, child);
      if (enclosed(parent.polygon, child.polygon)) {
        child.parent = parent;
        break;
      }
    }
  }
  for (const outline of outlines) {
    let p = outline.parent;
    while (p) {
      outline.depth++;
      p = p.parent;
    }
  }
  // Without operation metadata, a filled, unstroked object inside a stroke-only
  // part is likely engraving. Exclude the whole object and its nested counters.
  // Explicit cut intent or a feature marker takes precedence over this heuristic.
  const artwork = new Set<Outline>();
  for (const outline of [...outlines].sort((a, b) => a.depth - b.depth)) {
    const { shape, parent } = outline;
    if (!parent || shape.operation === 'cut' || shape.resize === 'hole' || shape.resize === 'slot')
      continue;
    const filled = shape.fill !== 'none' && shape.fill !== 'transparent';
    const unstroked = shape.stroke === 'none' || shape.stroke === 'transparent';
    const cutParent =
      parent.shape.fill === 'none' &&
      parent.shape.stroke !== 'none' &&
      parent.shape.stroke !== 'transparent';
    if (artwork.has(parent) || (shape !== parent.shape && filled && unstroked && cutParent))
      artwork.add(outline);
  }
  const eligible = outlines.filter((o) => !artwork.has(o));
  for (const outline of eligible) {
    while (outline.parent && artwork.has(outline.parent)) outline.parent = outline.parent.parent;
    outline.depth = 0;
    let ancestor = outline.parent;
    while (ancestor) {
      outline.depth++;
      ancestor = ancestor.parent;
    }
  }
  for (const outline of eligible) {
    const { shape, subpath } = outline,
      mark = shape.resize;
    if (mark && !['hole', 'slot', 'scale'].includes(mark))
      throw new SvgResizeError('INVALID_MARKER', 'data-resize must be hole, slot, or scale.');
    if (mark === 'scale') continue;
    let slot = rectangle(outline.polygon);
    // Rounded SVG rects retain an orthogonal frame even though the contour has arcs.
    if (!slot && shape.node.tag === 'rect') {
      const local = bounds(shape.paths[subpath]);
      const corners: Point[] = [
        [local.x, local.y],
        [local.x + local.width, local.y],
        [local.x + local.width, local.y + local.height],
        [local.x, local.y + local.height],
      ];
      slot = rectangle(corners.map((p) => point(outline.matrix, p)));
    }
    if (mark === 'hole' || mark === 'slot' || outline.depth % 2 === 1) {
      const kind = mark === 'hole' ? 'hole' : mark === 'slot' || slot ? 'slot' : 'hole';
      if (kind === 'slot' && !slot)
        throw new SvgResizeError(
          'INVALID_SLOT',
          'Marked slots must be orthogonal rectangles or rounded <rect> elements.',
        );
      const feature: Feature = {
        id: `shape-${shape.index}:path-${subpath}`,
        elementId: shape.node.attrs.id,
        subpath,
        kind,
        shape: 'interior',
        bounds: outline.bounds,
        center: center(outline.bounds),
        ...(kind === 'slot' ? slot : {}),
        source: mark ? 'marked' : 'detected',
      };
      found.push({ feature, outline, anchor: feature.center });
    }
    // U-shaped, straight-sided notches: the two inner turns must be concave.
    if (
      mark ||
      outline.depth % 2 === 1 ||
      !outline.world.every((c) => ['M', 'L', 'Z'].includes(c.type))
    )
      continue;
    const vertices = outline.world
      .filter((c) => c.type !== 'Z')
      .map((c) => c.values as unknown as Point);
    if (
      vertices.length > 1 &&
      Math.hypot(
        vertices[0][0] - vertices[vertices.length - 1][0],
        vertices[0][1] - vertices[vertices.length - 1][1],
      ) < 1e-8
    )
      vertices.pop();
    const sign = Math.sign(area(vertices));
    const occupied = new Set<number>();
    for (let i = 0; i < vertices.length; i++) {
      const ids = [
          i,
          (i + 1) % vertices.length,
          (i + 2) % vertices.length,
          (i + 3) % vertices.length,
        ],
        pts = ids.map((j) => vertices[j]);
      if (ids.some((j) => occupied.has(j))) continue;
      const rect = rectangle(pts);
      if (
        !rect ||
        cross(pts[0], pts[1], pts[2]) * sign >= 0 ||
        cross(pts[1], pts[2], pts[3]) * sign >= 0
      )
        continue;
      const depth = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]),
        width = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
      const axis: Point = [(pts[1][0] - pts[0][0]) / depth, (pts[1][1] - pts[0][1]) / depth];
      const b = bounds([
        { type: 'M', values: [...pts[0]] },
        ...pts.slice(1).map((p) => ({ type: 'L' as const, values: [...p] })),
      ]);
      const feature: Feature = {
        id: `shape-${shape.index}:path-${subpath}:notch-${i}`,
        elementId: shape.node.attrs.id,
        subpath,
        kind: 'slot',
        shape: 'notch',
        bounds: b,
        center: center(b),
        width,
        length: depth,
        axis,
        source: 'detected',
      };
      found.push({
        feature,
        outline,
        vertices: ids,
        anchor: [(pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2],
      });
      ids.forEach((j) => occupied.add(j));
    }
  }
  return { document, outlines: eligible, found, tolerance };
}
export function analysis(prepared: Prepared): Analysis {
  return {
    width: prepared.document.width,
    height: prepared.document.height,
    unit: 'mm',
    features: prepared.found.map((f) => f.feature),
  };
}
export function analyzeSvg(svg: string, options: AnalyzeOptions = {}): Analysis {
  return analysis(prepare(svg, options));
}

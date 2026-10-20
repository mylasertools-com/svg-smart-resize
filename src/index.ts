import {
  SvgResizeError,
  type Feature,
  type Issue,
  type Matrix,
  type Point,
  type PreserveMode,
  type ResizeOptions,
  type ResizeResult,
} from './types.js';
import { analysis, prepare, type Found } from './analyze.js';
import {
  mul,
  inverse,
  scale,
  translate,
  transform,
  point,
  format,
  matrixString,
} from './matrix.js';
import { bounds, flatten, serializePath, transformPath, type Contour } from './path.js';
import { length, type Shape } from './svg.js';
import { applyEdits, opening } from './xml.js';
import { boxesOverlap, enclosed, containsPoint, intersects, pointBounds } from './geometry.js';
export { analyzeSvg } from './analyze.js';
export { SvgResizeError } from './types.js';
export type {
  Analysis,
  AnalyzeOptions,
  Bounds,
  Feature,
  FeatureKind,
  Issue,
  Point,
  PreserveMode,
  ResizeOptions,
  ResizeResult,
} from './types.js';
function modeFor(found: Found, options: ResizeOptions): PreserveMode {
  const f = found.feature,
    override = options.preserve?.features?.[f.id],
    marked = found.outline.shape.node.attrs['data-preserve'];
  if (override !== undefined) return override;
  if (marked !== undefined) {
    if (!['all', 'width', 'none'].includes(marked))
      throw new SvgResizeError('INVALID_MARKER', 'data-preserve must be all, width, or none.');
    return marked as PreserveMode;
  }
  if (f.kind === 'hole') return options.preserve?.holes ? 'all' : 'none';
  const setting = options.preserve?.slots;
  return setting === true ? 'all' : setting === 'width' ? 'width' : 'none';
}
function correction(f: Found, sx: number, sy: number, mode: PreserveMode): Matrix {
  const anchor = f.anchor,
    m = f.outline.matrix;
  let desired: Matrix = [1, 0, 0, 1, 0, 0];
  if (mode === 'width') {
    const u = f.feature.axis;
    if (!u)
      throw new SvgResizeError(
        'INVALID_OPTIONS',
        'Width-only preservation is supported for slots, not arbitrary holes.',
      );
    const a = sx * u[0],
      b = sy * u[1],
      len = Math.hypot(a, b);
    // Map the long axis by the requested scale and keep an orthogonal, unit-width short axis.
    const v: Point = [-u[1], u[0]],
      outV: Point = [-b / len, a / len];
    desired = [
      a * u[0] + outV[0] * v[0],
      b * u[0] + outV[1] * v[0],
      a * u[1] + outV[0] * v[1],
      b * u[1] + outV[1] * v[1],
      0,
      0,
    ];
  }
  return mul(
    inverse(mul(scale(sx, sy), m)),
    mul(
      translate(anchor[0] * sx, anchor[1] * sy),
      mul(desired, mul(translate(-anchor[0], -anchor[1]), m)),
    ),
  );
}
/** Move a joint's inner vertices back to their original depth below the scaled outer line. */
function keepJointDepth(f: Found, path: Contour, sx: number, sy: number) {
  const joint = f.joint!,
    toNew = mul(scale(sx, sy), f.outline.matrix),
    back = inverse(toNew),
    [nx, ny] = joint.normal,
    l = Math.hypot(nx / sx, ny / sy),
    normal: Point = [nx / sx / l, ny / sy / l],
    origin: Point = [nx * joint.outer * sx, ny * joint.outer * sy];
  for (const i of joint.inner) {
    const p = point(toNew, path[i].values as unknown as Point),
      shift = joint.depth - (normal[0] * (p[0] - origin[0]) + normal[1] * (p[1] - origin[1]));
    path[i].values = [...point(back, [p[0] + shift * normal[0], p[1] + shift * normal[1]])];
  }
}
/** Resize an SVG viewport and optionally preserve physical hole/slot dimensions. No DOM needed. */
export function resizeSvg(svg: string, options: ResizeOptions): ResizeResult {
  if (!options || typeof options !== 'object')
    throw new SvgResizeError('INVALID_OPTIONS', 'Resize options are required.');
  const precision = options.precision ?? 6;
  if (!Number.isInteger(precision) || precision < 2 || precision > 12)
    throw new SvgResizeError('INVALID_OPTIONS', 'precision must be an integer from 2 to 12.');
  const prepared = prepare(svg, options),
    doc = prepared.document;
  let width: number, height: number;
  if (options.scale !== undefined) {
    if (options.width !== undefined || options.height !== undefined)
      throw new SvgResizeError('INVALID_OPTIONS', 'Use scale or width/height, not both.');
    const factors =
      typeof options.scale === 'number' ? [options.scale, options.scale] : options.scale;
    if (!Array.isArray(factors) || factors.length !== 2)
      throw new SvgResizeError('INVALID_OPTIONS', 'scale must be a number or [x, y].');
    width = doc.width * factors[0];
    height = doc.height * factors[1];
  } else {
    const unit = options.unit ?? 'mm';
    if (!['mm', 'cm', 'in', 'px'].includes(unit))
      throw new SvgResizeError('INVALID_OPTIONS', 'Unsupported output unit.');
    if (options.width === undefined && options.height === undefined)
      throw new SvgResizeError('INVALID_OPTIONS', 'Provide width, height, or scale.');
    width = options.width === undefined ? NaN : length(`${options.width}${unit}`);
    height = options.height === undefined ? NaN : length(`${options.height}${unit}`);
    if (options.width === undefined) width = (height * doc.width) / doc.height;
    if (options.height === undefined) height = (width * doc.height) / doc.width;
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 1e7 ||
    height > 1e7
  )
    throw new SvgResizeError(
      'INVALID_SIZE',
      'Target dimensions must be positive and at most 10,000,000 mm.',
    );
  const sx = width / doc.width,
    sy = height / doc.height;
  if (sx < 1e-6 || sy < 1e-6 || sx > 1e6 || sy > 1e6)
    throw new SvgResizeError(
      'INVALID_SIZE',
      'Scale factors must be between 0.000001 and 1,000,000.',
    );
  const overrides = options.preserve?.features ?? {};
  for (const [id, mode] of Object.entries(overrides)) {
    if (!prepared.found.some((f) => f.feature.id === id))
      throw new SvgResizeError(
        'UNKNOWN_FEATURE',
        `Unknown feature ID: ${id}. Analyze the same source SVG before resizing.`,
      );
    if (!['all', 'width', 'none'].includes(mode))
      throw new SvgResizeError('INVALID_OPTIONS', `Invalid preservation mode for ${id}.`);
  }
  const output = new Map<Shape, Contour[]>();
  for (const shape of doc.shapes)
    output.set(
      shape,
      shape.paths.map((p) => p.map((c) => ({ type: c.type, values: [...c.values] }))),
    );
  const preserved: ResizeResult['preserved'] = [];
  for (const f of prepared.found) {
    const mode = modeFor(f, options);
    if (mode === 'none') continue;
    const paths = output.get(f.outline.shape)!,
      old = f.outline.shape.paths[f.outline.subpath];
    if (f.vertices) {
      // Joints move vertices in place, so several joints can share a corner.
      if (f.joint) keepJointDepth(f, paths[f.outline.subpath], sx, sy);
      else {
        const c = correction(f, sx, sy, mode);
        for (const i of f.vertices)
          paths[f.outline.subpath][i].values = [...point(c, old[i].values as unknown as Point)];
      }
      // Explicit closing lineto must continue to match a moved moveto.
      const p = paths[f.outline.subpath],
        last = p[p.length - 1].type === 'Z' ? p.length - 2 : p.length - 1;
      if (
        old[last].type === 'L' &&
        old[last].values[0] === old[0].values[0] &&
        old[last].values[1] === old[0].values[1]
      )
        p[last].values = [...p[0].values];
    } else paths[f.outline.subpath] = transformPath(old, correction(f, sx, sy, mode));
    preserved.push({ id: f.feature.id, mode });
  }
  const root = doc.root,
    k = mul(scale(sx, sy), doc.viewport),
    rootTransform = transform(root.attrs.transform);
  const patches = new Map<Shape, Record<string, string>>();
  for (const shape of doc.shapes) {
    if (
      !prepared.found.some(
        (f) => f.outline.shape === shape && preserved.some((p) => p.id === f.feature.id),
      )
    )
      continue;
    const paths = output.get(shape)!;
    if (shape.node.tag === 'path') patches.set(shape, { d: serializePath(paths, precision) });
    else if (
      (shape.node.tag === 'polygon' || shape.node.tag === 'polyline') &&
      prepared.found.some((f) => f.outline.shape === shape && f.vertices)
    )
      patches.set(shape, {
        points: paths[0]
          .filter((c) => c.type !== 'Z')
          .map((c) => c.values.map((n) => format(n, precision)).join(','))
          .join(' '),
      });
    else {
      const f = prepared.found.find(
        (f) => f.outline.shape === shape && preserved.some((p) => p.id === f.feature.id),
      )!;
      const mode = preserved.find((p) => p.id === f.feature.id)!.mode;
      patches.set(shape, {
        transform: matrixString(
          mul(transform(shape.node.attrs.transform), correction(f, sx, sy, mode)),
          precision,
        ),
      });
    }
  }
  const edits: Array<{ start: number; end: number; value: string }> = [
    {
      start: root.start,
      end: root.end,
      value:
        opening(root, {
          xmlns: 'http://www.w3.org/2000/svg',
          width: `${format(width, precision)}mm`,
          height: `${format(height, precision)}mm`,
          viewBox: `0 0 ${format(width, precision)} ${format(height, precision)}`,
          preserveAspectRatio: 'none',
          transform: '',
        }) + `\n<g transform="${matrixString(mul(k, rootTransform), precision)}">`,
    },
    { start: root.closeStart, end: root.closeStart, value: '</g>\n' },
  ];
  for (const [shape, patch] of patches)
    edits.push({ start: shape.node.start, end: shape.node.end, value: opening(shape.node, patch) });
  const resultSvg = applyEdits(svg, edits);
  const geometry = new Map(
    prepared.outlines.map((o) => {
      const world = transformPath(output.get(o.shape)![o.subpath], mul(scale(sx, sy), o.matrix));
      return [
        o,
        { world, polygon: flatten(world, prepared.tolerance), bounds: bounds(world) },
      ] as const;
    }),
  );
  const issues: Issue[] = [];
  let conflictWork = 0;
  const budget = (a: Point[], b: Point[]) => {
    conflictWork += a.length * b.length;
    if (conflictWork > 20_000_000)
      throw new SvgResizeError(
        'COMPLEXITY_LIMIT',
        'Resize exceeds the conflict analysis budget. Resize fewer shapes at a time.',
      );
  };
  for (const f of prepared.found) {
    if (!f.vertices || !preserved.some((p) => p.id === f.feature.id)) continue;
    const polygon = geometry.get(f.outline)!.polygon;
    budget(polygon, polygon);
    let crossed = false;
    for (let i = 0; i < polygon.length && !crossed; i++)
      for (let j = i + 2; j < polygon.length; j++) {
        if (i === 0 && j === polygon.length - 1) continue;
        if (
          intersects(
            [polygon[i], polygon[(i + 1) % polygon.length]],
            [polygon[j], polygon[(j + 1) % polygon.length]],
          )
        ) {
          crossed = true;
          break;
        }
      }
    if (crossed)
      issues.push({
        code: 'FEATURE_OVERLAP',
        featureId: f.feature.id,
        message: `${f.feature.id} creates intersecting outline edges after resizing.`,
      });
  }
  for (const f of prepared.found) {
    if (!preserved.some((p) => p.id === f.feature.id) || f.vertices) continue;
    const geo = geometry.get(f.outline)!,
      parent = f.outline.parent;
    if (parent) budget(geometry.get(parent)!.polygon, geo.polygon);
    if (parent && !enclosed(geometry.get(parent)!.polygon, geo.polygon))
      issues.push({
        code: 'FEATURE_OUTSIDE_OUTLINE',
        featureId: f.feature.id,
        message: `${f.feature.id} no longer fits inside its containing outline.`,
      });
    for (const child of prepared.outlines.filter((o) => o.parent === f.outline)) {
      const nested = geometry.get(child)!;
      budget(geo.polygon, nested.polygon);
      if (!enclosed(geo.polygon, nested.polygon))
        issues.push({
          code: 'FEATURE_OVERLAP',
          featureId: f.feature.id,
          message: f.feature.id + ' no longer contains a nested island after resizing.',
        });
    }
    for (const other of prepared.outlines) {
      if (other === f.outline || other.parent !== parent || !parent) continue;
      const b = geometry.get(other)!;
      if (!boxesOverlap(geo.bounds, b.bounds)) continue;
      budget(geo.polygon, b.polygon);
      if (
        intersects(geo.polygon, b.polygon) ||
        containsPoint(geo.polygon[0], b.polygon) ||
        containsPoint(b.polygon[0], geo.polygon)
      ) {
        if (!issues.some((i) => i.code === 'FEATURE_OVERLAP' && i.featureId === f.feature.id))
          issues.push({
            code: 'FEATURE_OVERLAP',
            featureId: f.feature.id,
            message: `${f.feature.id} touches or overlaps another contour after resizing.`,
          });
      }
    }
  }
  if (options.strict && issues.length)
    throw new SvgResizeError('FEATURE_CONFLICT', issues.map((i) => i.message).join(' '));
  const features: Feature[] = prepared.found.map((f) => {
    const mode = preserved.find((p) => p.id === f.feature.id)?.mode;
    if (f.joint) {
      const world = geometry.get(f.outline)!.world,
        b = pointBounds(f.vertices!.map((j) => world[j].values as unknown as Point)),
        [ax, ay] = f.joint.axis,
        along = Math.hypot(sx * ax, sy * ay),
        across = 1 / Math.hypot(f.joint.normal[0] / sx, f.joint.normal[1] / sy);
      return {
        ...f.feature,
        bounds: b,
        center: [b.x + b.width / 2, b.y + b.height / 2],
        length: f.feature.length! * along,
        width: f.joint.depth * (mode ? 1 : across),
        axis: [(sx * ax) / along, (sy * ay) / along],
      };
    }
    const source = f.vertices ? f.vertices.map((i) => f.outline.world[i]) : f.outline.world;
    const path: Contour = f.vertices
      ? [
          { type: 'M', values: [...source[0].values] },
          ...source.slice(1).map((c) => ({ type: 'L' as const, values: [...c.values] })),
          { type: 'Z', values: [] },
        ]
      : source;
    const localToNew = mode
      ? mul(
          mul(scale(sx, sy), f.outline.matrix),
          mul(correction(f, sx, sy, mode), inverse(f.outline.matrix)),
        )
      : scale(sx, sy);
    const b = bounds(transformPath(path, localToNew));
    const axis = f.feature.axis;
    const longScale = axis ? Math.hypot(sx * axis[0], sy * axis[1]) : 1;
    const shortScale = axis ? Math.hypot(sx * axis[1], sy * axis[0]) : 1;
    return {
      ...f.feature,
      bounds: b,
      center: [b.x + b.width / 2, b.y + b.height / 2],
      ...(axis
        ? {
            length: f.feature.length! * (mode === 'all' ? 1 : longScale),
            width: f.feature.width! * (mode ? 1 : shortScale),
            axis:
              mode === 'all'
                ? axis
                : ([(sx * axis[0]) / longScale, (sy * axis[1]) / longScale] as Point),
          }
        : {}),
    };
  });
  return {
    ...analysis(prepared),
    width,
    height,
    svg: resultSvg,
    scale: [sx, sy],
    features,
    preserved,
    issues,
  };
}

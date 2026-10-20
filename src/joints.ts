import type { Point } from './types.js';
import { area } from './geometry.js';
export interface JointRun {
  /** Unit direction along the joint edge. */
  axis: Point;
  /** Unit normal pointing from the outer line into the material. */
  normal: Point;
  /** Offset of the outer line along the normal. */
  outer: number;
  /** Distance between the outer and inner lines: the material thickness. */
  depth: number;
  /** Vertices on the inner line; these follow the outer line at a fixed depth. */
  inner: number[];
  /** Every vertex that belongs to the run. */
  vertices: number[];
  from: number;
  to: number;
}
const MIN_STEPS = 3;
// Fingers are at least half as wide as they are deep. Narrower, deeper cuts
// are a comb of slots, whose width is the dimension that must not change.
const MIN_FINGER = 0.5;
const MAX_DEPTH_SHARE = 1 / 4;
const unit = (a: Point, b: Point): Point => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
/**
 * Finger joints, as on box panels: an edge stepping between two parallel
 * lines one material thickness apart. Every step is a straight segment
 * whose neighbours run parallel, in the same direction.
 */
export function jointRuns(vertices: Point[], size: number, epsilon: number): JointRun[] {
  const n = vertices.length;
  if (n < 6) return [];
  const sign = Math.sign(area(vertices));
  const at = (i: number) => vertices[((i % n) + n) % n];
  const length = (i: number) => Math.hypot(at(i + 1)[0] - at(i)[0], at(i + 1)[1] - at(i)[1]);
  const groups: Array<{ normal: Point; outer: number; depth: number; steps: number[] }> = [];
  for (let i = 0; i < n; i++) {
    if (length(i - 1) < epsilon || length(i) < epsilon || length(i + 1) < epsilon) continue;
    const before = unit(at(i - 1), at(i)),
      step = unit(at(i), at(i + 1)),
      after = unit(at(i + 1), at(i + 2));
    if (dot(before, after) < 1 - 1e-9 || Math.abs(dot(before, step)) > 1e-6) continue;
    // Material lies to the left of a counterclockwise outline.
    const normal: Point = [-before[1] * sign, before[0] * sign];
    const a = dot(normal, at(i)),
      b = dot(normal, at(i + 1)),
      depth = Math.abs(b - a);
    if (depth > size * MAX_DEPTH_SHARE) continue;
    const outer = Math.min(a, b);
    const group = groups.find(
      (g) =>
        dot(g.normal, normal) > 1 - 1e-9 &&
        Math.abs(g.outer - outer) <= epsilon &&
        Math.abs(g.depth - depth) <= epsilon,
    );
    if (group) group.steps.push(i);
    else groups.push({ normal, outer, depth, steps: [i] });
  }
  const runs: JointRun[] = [];
  for (const { normal, outer, depth, steps } of groups) {
    if (steps.length < MIN_STEPS) continue;
    const axis: Point = [normal[1], -normal[0]];
    const along = steps.map((i) => dot(axis, at(i))).sort((x, y) => x - y);
    if (along.slice(1).some((x, k) => x - along[k] < depth * MIN_FINGER - epsilon)) continue;
    const inner = new Set<number>(),
      all = new Set<number>();
    const onInner = (i: number) => Math.abs(dot(normal, at(i)) - outer - depth) <= epsilon;
    for (const i of steps) {
      const j = (i + 1) % n;
      all.add(i).add(j);
      // The inner end of a step and the far end of its parallel neighbour.
      const end = onInner(i) ? i : j,
        neighbour = end === i ? (i - 1 + n) % n : (j + 1) % n;
      inner.add(end).add(neighbour);
      all.add(neighbour);
    }
    const positions = [...all].map((i) => dot(axis, at(i)));
    runs.push({
      axis,
      normal,
      outer,
      depth,
      inner: [...inner].sort((x, y) => x - y),
      vertices: [...all].sort((x, y) => x - y),
      from: Math.min(...positions),
      to: Math.max(...positions),
    });
  }
  return runs;
}

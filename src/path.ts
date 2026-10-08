import { SvgResizeError, type Bounds, type Matrix, type Point } from './types.js';
import { NUMBER, format, point } from './matrix.js';
export interface Command {
  type: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';
  values: number[];
}
export type Contour = Command[];
const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
export function parsePath(d: string): Contour[] {
  let i = 0,
    command = '',
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    previous = '',
    control: Point = [0, 0],
    count = 0;
  const contours: Contour[] = [];
  let contour: Contour = [];
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const fail = (): never => {
    throw new SvgResizeError('INVALID_PATH', `Malformed SVG path at character ${i}.`);
  };
  while (true) {
    skip();
    if (i === d.length) break;
    if (/[a-z]/i.test(d[i])) command = d[i++];
    else if (!command) fail();
    const type = command.toUpperCase(),
      relative = command !== type;
    if (type === 'Z') {
      if (!contour.length) fail();
      contour.push({ type: 'Z', values: [] });
      x = sx;
      y = sy;
      previous = 'Z';
      command = '';
      continue;
    }
    if (!arity[type] || (!contour.length && type !== 'M')) fail();
    const v: number[] = [];
    for (let j = 0; j < arity[type]; j++) {
      skip();
      if (type === 'A' && (j === 3 || j === 4)) {
        if (d[i] !== '0' && d[i] !== '1') fail();
        v.push(+d[i++]);
      } else {
        NUMBER.lastIndex = i;
        const n = NUMBER.exec(d);
        if (!n || !Number.isFinite(+n[0]) || Math.abs(+n[0]) > 1e9) fail();
        v.push(+n![0]);
        i = NUMBER.lastIndex;
      }
    }
    if (++count > 100000)
      throw new SvgResizeError('COMPLEXITY_LIMIT', 'SVG contains too many path commands.');
    const abs = (j: number): Point => [v[j] + (relative ? x : 0), v[j + 1] + (relative ? y : 0)];
    let c: Command;
    if (type === 'M') {
      const p = abs(0);
      x = p[0];
      y = p[1];
      sx = x;
      sy = y;
      contour = [];
      contours.push(contour);
      c = { type: 'M', values: [x, y] };
      command = relative ? 'l' : 'L';
    } else if (type === 'L') c = { type: 'L', values: [...abs(0)] };
    else if (type === 'H') c = { type: 'L', values: [v[0] + (relative ? x : 0), y] };
    else if (type === 'V') c = { type: 'L', values: [x, v[0] + (relative ? y : 0)] };
    else if (type === 'C') c = { type: 'C', values: [...abs(0), ...abs(2), ...abs(4)] };
    else if (type === 'S')
      c = {
        type: 'C',
        values: [
          ...(previous === 'C' || previous === 'S'
            ? [2 * x - control[0], 2 * y - control[1]]
            : [x, y]),
          ...abs(0),
          ...abs(2),
        ],
      };
    else if (type === 'Q') c = { type: 'Q', values: [...abs(0), ...abs(2)] };
    else if (type === 'T')
      c = {
        type: 'Q',
        values: [
          ...(previous === 'Q' || previous === 'T'
            ? [2 * x - control[0], 2 * y - control[1]]
            : [x, y]),
          ...abs(0),
        ],
      };
    else c = { type: 'A', values: [Math.abs(v[0]), Math.abs(v[1]), v[2], v[3], v[4], ...abs(5)] };
    contour.push(c);
    const a = c.values;
    x = a[a.length - 2];
    y = a[a.length - 1];
    if (c.type === 'C' || c.type === 'Q') control = [a[a.length - 4], a[a.length - 3]];
    previous = type;
  }
  return contours;
}
export function transformPath(path: Contour, m: Matrix): Contour {
  return path.map((c) => {
    const v = c.values;
    if (c.type === 'Z') return { type: 'Z', values: [] };
    if (c.type !== 'A') {
      const values: number[] = [];
      for (let j = 0; j < v.length; j += 2) values.push(...point(m, [v[j], v[j + 1]]));
      return { type: c.type, values };
    }
    const a = (v[2] * Math.PI) / 180,
      cos = Math.cos(a),
      sin = Math.sin(a);
    const u = [v[0] * (m[0] * cos + m[2] * sin), v[0] * (m[1] * cos + m[3] * sin)];
    const w = [v[1] * (-m[0] * sin + m[2] * cos), v[1] * (-m[1] * sin + m[3] * cos)];
    const xx = u[0] * u[0] + w[0] * w[0],
      yy = u[1] * u[1] + w[1] * w[1],
      xy = u[0] * u[1] + w[0] * w[1];
    const discriminant = Math.hypot(xx - yy, 2 * xy);
    const rx = Math.sqrt(Math.max(0, (xx + yy + discriminant) / 2));
    // det(E Eᵀ) / largest eigenvalue avoids cancellation for slender ellipses.
    const det = u[0] * w[1] - u[1] * w[0],
      ry = rx ? Math.abs(det) / rx : 0;
    const angle = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
    return {
      type: 'A',
      values: [
        rx,
        ry,
        angle,
        v[3],
        m[0] * m[3] - m[1] * m[2] < 0 ? 1 - v[4] : v[4],
        ...point(m, [v[5], v[6]]),
      ],
    };
  });
}
export function serializePath(paths: Contour[], precision: number): string {
  return paths
    .map((path) =>
      path.map((c) => c.type + c.values.map((n) => format(n, precision)).join(' ')).join(''),
    )
    .join('');
}
interface Arc {
  center: Point;
  rx: number;
  ry: number;
  phi: number;
  start: number;
  delta: number;
}
function arc(p: Point, v: number[]): Arc | null {
  let [rx, ry, angle, large, sweep, x, y] = v;
  if (!rx || !ry || (p[0] === x && p[1] === y)) return null;
  const phi = (angle * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (p[0] - x) / 2,
    dy = (p[1] - y) / 2,
    xp = c * dx + s * dy,
    yp = -s * dx + c * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const ratio = Math.max(
    0,
    (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) /
      (rx * rx * yp * yp + ry * ry * xp * xp),
  );
  const k = (large === sweep ? -1 : 1) * Math.sqrt(ratio),
    cxp = (k * rx * yp) / ry,
    cyp = (-k * ry * xp) / rx;
  const center: Point = [c * cxp - s * cyp + (p[0] + x) / 2, s * cxp + c * cyp + (p[1] + y) / 2];
  const start = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx),
    end = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx);
  let delta = end - start;
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  return { center, rx, ry, phi, start, delta };
}
function arcPoint(a: Arc, t: number): Point {
  const c = Math.cos(a.phi),
    s = Math.sin(a.phi),
    x = a.rx * Math.cos(t),
    y = a.ry * Math.sin(t);
  return [a.center[0] + c * x - s * y, a.center[1] + s * x + c * y];
}
function bezier(points: Point[], t: number): Point {
  let a = points.map((p) => [...p]);
  while (a.length > 1)
    a = a.slice(1).map((p, i) => [a[i][0] * (1 - t) + p[0] * t, a[i][1] * (1 - t) + p[1] * t]);
  return a[0] as unknown as Point;
}
function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-14) return Math.abs(b) < 1e-14 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  return [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)];
}
/** Exact curve extrema, independent of the analysis sampling tolerance. */
export function bounds(path: Contour): Bounds {
  const points: Point[] = [];
  let p: Point = [0, 0],
    start = p;
  for (const cmd of path) {
    const v = cmd.values;
    if (cmd.type === 'Z') {
      p = start;
      continue;
    }
    const end: Point = [v[v.length - 2], v[v.length - 1]];
    points.push(end);
    if (cmd.type === 'M') start = end;
    if (cmd.type === 'C' || cmd.type === 'Q') {
      const pts: Point[] = [p];
      for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      for (let axis = 0; axis < 2; axis++) {
        const n = pts.map((x) => x[axis]);
        const ts =
          n.length === 3
            ? roots(0, n[0] - 2 * n[1] + n[2], n[1] - n[0])
            : roots(-n[0] + 3 * n[1] - 3 * n[2] + n[3], 2 * (n[0] - 2 * n[1] + n[2]), n[1] - n[0]);
        for (const t of ts) if (t > 0 && t < 1) points.push(bezier(pts, t));
      }
    } else if (cmd.type === 'A') {
      const a = arc(p, v);
      if (a)
        for (const angle of [
          Math.atan2(-a.ry * Math.sin(a.phi), a.rx * Math.cos(a.phi)),
          Math.atan2(a.ry * Math.cos(a.phi), a.rx * Math.sin(a.phi)),
        ]) {
          for (const t of [angle, angle + Math.PI]) {
            const delta =
              (((a.delta > 0 ? t - a.start : a.start - t) % (Math.PI * 2)) + Math.PI * 2) %
              (Math.PI * 2);
            if (delta <= Math.abs(a.delta) + 1e-10) points.push(arcPoint(a, t));
          }
        }
    }
    p = end;
  }
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p[0]);
    top = Math.min(top, p[1]);
    right = Math.max(right, p[0]);
    bottom = Math.max(bottom, p[1]);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function flatten(path: Contour, tolerance: number): Point[] {
  const out: Point[] = [];
  let p: Point = [0, 0];
  const add = (q: Point) => {
    if (out.length > 20000)
      throw new SvgResizeError(
        'COMPLEXITY_LIMIT',
        'A contour needs too many samples. Increase tolerance or simplify the input.',
      );
    out.push(q);
  };
  const curve = (pts: Point[], depth = 0) => {
    const a = pts[0],
      b = pts[pts.length - 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    const error = Math.max(
      ...pts
        .slice(1, -1)
        .map((p) =>
          len
            ? Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy) / len
            : Math.hypot(p[0] - a[0], p[1] - a[1]),
        ),
    );
    const polygonLength = pts
      .slice(1)
      .reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    if (depth >= 18 || (error <= tolerance && polygonLength - len <= tolerance)) {
      add(b);
      return;
    }
    let work = pts.map((p) => [...p] as Point);
    const left: Point[] = [work[0]],
      right: Point[] = [work[work.length - 1]];
    while (work.length > 1) {
      work = work.slice(1).map((q, i) => [(q[0] + work[i][0]) / 2, (q[1] + work[i][1]) / 2]);
      left.push(work[0]);
      right.unshift(work[work.length - 1]);
    }
    curve(left, depth + 1);
    curve(right, depth + 1);
  };
  for (const cmd of path) {
    const v = cmd.values;
    if (cmd.type === 'Z') continue;
    const end: Point = [v[v.length - 2], v[v.length - 1]];
    if (cmd.type === 'C' || cmd.type === 'Q') {
      const pts: Point[] = [p];
      for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      curve(pts);
    } else if (cmd.type === 'A') {
      const a = arc(p, v);
      if (a) {
        const step = 2 * Math.acos(Math.max(-1, 1 - tolerance / Math.max(a.rx, a.ry)));
        const count = Math.max(4, Math.ceil(Math.abs(a.delta) / Math.max(step, 1e-5)));
        if (count > 20000)
          throw new SvgResizeError('COMPLEXITY_LIMIT', 'Arc needs too many samples.');
        for (let j = 1; j <= count; j++) add(arcPoint(a, a.start + (a.delta * j) / count));
      } else add(end);
    } else add(end);
    p = end;
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-9
  )
    out.pop();
  return out;
}
export function isClosed(path: Contour): boolean {
  if (!path.length) return false;
  if (path[path.length - 1].type === 'Z') return true;
  const first = path[0].values,
    last = path[path.length - 1].values;
  return Math.hypot(first[0] - last[last.length - 2], first[1] - last[last.length - 1]) < 1e-9;
}

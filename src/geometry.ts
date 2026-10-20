import type { Bounds, Point } from './types.js';
export function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function area(p: Point[]): number {
  return (
    p.reduce((a, q, i) => {
      const r = p[(i + 1) % p.length];
      return a + q[0] * r[1] - q[1] * r[0];
    }, 0) / 2
  );
}
export function containsPoint(p: Point, poly: Point[], epsilon = 1e-8): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      Math.abs(cross(a, b, p)) <= epsilon * Math.hypot(b[0] - a[0], b[1] - a[1]) &&
      p[0] >= Math.min(a[0], b[0]) - epsilon &&
      p[0] <= Math.max(a[0], b[0]) + epsilon &&
      p[1] >= Math.min(a[1], b[1]) - epsilon &&
      p[1] <= Math.max(a[1], b[1]) + epsilon
    )
      return false;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function intersects(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      if (
        Math.max(p[0], q[0]) + 1e-9 < Math.min(r[0], s[0]) ||
        Math.max(r[0], s[0]) + 1e-9 < Math.min(p[0], q[0]) ||
        Math.max(p[1], q[1]) + 1e-9 < Math.min(r[1], s[1]) ||
        Math.max(r[1], s[1]) + 1e-9 < Math.min(p[1], q[1])
      )
        continue;
      const c1 = cross(p, q, r),
        c2 = cross(p, q, s),
        c3 = cross(r, s, p),
        c4 = cross(r, s, q);
      if (c1 * c2 <= 1e-16 && c3 * c4 <= 1e-16) return true;
    }
  return false;
}
export function boxContains(a: Bounds, b: Bounds): boolean {
  return (
    b.x >= a.x - 1e-8 &&
    b.y >= a.y - 1e-8 &&
    b.x + b.width <= a.x + a.width + 1e-8 &&
    b.y + b.height <= a.y + a.height + 1e-8
  );
}
export function boxesOverlap(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
export function enclosed(a: Point[], b: Point[]): boolean {
  return b.every((p) => containsPoint(p, a)) && !intersects(a, b);
}
export function rectangle(
  points: Point[],
): { axis: Point; width: number; length: number } | undefined {
  if (points.length !== 4) return;
  const vectors = points.map((p, i) => {
    const q = points[(i + 1) % 4];
    return [q[0] - p[0], q[1] - p[1]] as Point;
  });
  const lengths = vectors.map((p) => Math.hypot(...p));
  if (lengths.some((n) => n < 1e-7)) return;
  for (let i = 0; i < 4; i++) {
    const a = vectors[i],
      b = vectors[(i + 1) % 4];
    if (Math.abs(a[0] * b[0] + a[1] * b[1]) > lengths[i] * lengths[(i + 1) % 4] * 1e-6) return;
  }
  if (Math.abs(lengths[0] - lengths[2]) > 1e-6 || Math.abs(lengths[1] - lengths[3]) > 1e-6) return;
  const long = lengths[0] >= lengths[1] ? 0 : 1;
  return {
    axis: [vectors[long][0] / lengths[long], vectors[long][1] / lengths[long]],
    length: lengths[long],
    width: lengths[1 - long],
  };
}
export function hullArea(points: Point[]): number {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return 0;
  const half = (list: Point[]) => {
    const h: Point[] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return Math.abs(area([...half(p), ...half([...p].reverse())]));
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy,
    t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** True when the polygon looks the same after a half turn about its box center. */
export function pointSymmetric(poly: Point[], box: Bounds, tolerance: number): boolean {
  const cx = 2 * box.x + box.width,
    cy = 2 * box.y + box.height,
    step = Math.max(1, Math.floor(poly.length / 64));
  for (let i = 0; i < poly.length; i += step) {
    const q: Point = [cx - poly[i][0], cy - poly[i][1]];
    let nearest = Infinity;
    for (let j = 0; j < poly.length && nearest > tolerance; j++)
      nearest = Math.min(nearest, segmentDistance(q, poly[j], poly[(j + 1) % poly.length]));
    if (nearest > tolerance) return false;
  }
  return true;
}
export function pointBounds(points: Point[]): Bounds {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

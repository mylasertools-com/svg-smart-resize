import { SvgResizeError, type Matrix, type Point } from './types.js';
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(d) || Math.abs(d) < 1e-15)
    throw new SvgResizeError(
      'SINGULAR_TRANSFORM',
      'Cannot resize geometry with a singular transform.',
    );
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
export function point(m: Matrix, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}
export function scale(x: number, y = x): Matrix {
  return [x, 0, 0, y, 0, 0];
}
export const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
export function numbers(value: string): number[] {
  const result: number[] = [];
  let i = 0;
  while (i < value.length) {
    if (/[\s,]/.test(value[i])) {
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(value);
    if (!match || !Number.isFinite(+match[0]))
      throw new SvgResizeError(
        'INVALID_NUMBER',
        `Invalid numeric value near ${value.slice(i, i + 20)}.`,
      );
    result.push(+match[0]);
    i = NUMBER.lastIndex;
  }
  return result;
}
export function transform(value = ''): Matrix {
  let result = IDENTITY,
    end = 0;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const match of value.matchAll(re)) {
    if (value.slice(end, match.index).trim().replace(/,/g, ''))
      throw new SvgResizeError('INVALID_TRANSFORM', 'Malformed SVG transform.');
    const n = numbers(match[2]),
      name = match[1];
    let m: Matrix;
    if (name === 'matrix' && n.length === 6) m = n as unknown as Matrix;
    else if (name === 'translate' && (n.length === 1 || n.length === 2))
      m = translate(n[0], n[1] ?? 0);
    else if (name === 'scale' && (n.length === 1 || n.length === 2)) m = scale(n[0], n[1] ?? n[0]);
    else if (name === 'rotate' && (n.length === 1 || n.length === 3)) {
      const a = (n[0] * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a);
      m = [c, s, -s, c, 0, 0];
      if (n.length === 3) m = mul(mul(translate(n[1], n[2]), m), translate(-n[1], -n[2]));
    } else if ((name === 'skewX' || name === 'skewY') && n.length === 1) {
      const t = Math.tan((n[0] * Math.PI) / 180);
      m = name === 'skewX' ? [1, 0, t, 1, 0, 0] : [1, t, 0, 1, 0, 0];
    } else
      throw new SvgResizeError('INVALID_TRANSFORM', `Unsupported or malformed transform: ${name}.`);
    result = mul(result, m);
    end = match.index! + match[0].length;
  }
  if (value.slice(end).trim())
    throw new SvgResizeError('INVALID_TRANSFORM', 'Malformed SVG transform.');
  inverse(result);
  return result;
}
export function format(n: number, precision: number): string {
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw new SvgResizeError('NUMERIC_RANGE', 'Geometry exceeds the supported numeric range.');
  return String(Number(n.toFixed(precision)));
}
export function matrixString(m: Matrix, precision: number): string {
  return `matrix(${m.map((n) => format(n, precision)).join(' ')})`;
}

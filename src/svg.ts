import { SvgResizeError, type Matrix } from './types.js';
import { IDENTITY, mul, numbers, scale, transform, translate } from './matrix.js';
import { parsePath, type Contour } from './path.js';
import { parseXml, type Element } from './xml.js';
export interface Shape {
  node: Element;
  matrix: Matrix;
  paths: Contour[];
  index: number;
  /** Inherited fabrication intent and presentation, used only for detection. */
  operation?: string;
  resize?: string;
  fill: string;
  stroke: string;
}
export interface Document {
  root: Element;
  width: number;
  height: number;
  viewport: Matrix;
  shapes: Shape[];
}
const mm: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  px: 25.4 / 96,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  q: 0.25,
};
export function length(value: string | undefined, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|px|pt|pc|q)?\s*$/i.exec(
    value ?? '',
  );
  if (!m || !Number.isFinite(+m[1]))
    throw new SvgResizeError(
      'INVALID_LENGTH',
      `Expected an absolute SVG length, got ${value}. Percentages and font-relative units are unsupported.`,
    );
  return +m[1] * mm[m[2]?.toLowerCase() ?? 'px'];
}
function attr(node: Element, key: string, fallback = 0): number {
  const v = node.attrs[key];
  return v === undefined ? fallback : length(v) / (25.4 / 96);
}
function shapePaths(node: Element): Contour[] {
  if (node.tag === 'path') return parsePath(node.attrs.d ?? '');
  if (node.tag === 'line')
    return parsePath(
      `M${attr(node, 'x1')} ${attr(node, 'y1')}L${attr(node, 'x2')} ${attr(node, 'y2')}`,
    );
  if (node.tag === 'polygon' || node.tag === 'polyline') {
    const p = numbers(node.attrs.points ?? '');
    if (p.length % 2)
      throw new SvgResizeError('INVALID_POINTS', 'A points attribute needs coordinate pairs.');
    return p.length ? parsePath(`M${p.join(' ')}${node.tag === 'polygon' ? 'Z' : ''}`) : [];
  }
  if (node.tag === 'rect') {
    const x = attr(node, 'x'),
      y = attr(node, 'y'),
      w = attr(node, 'width'),
      h = attr(node, 'height');
    if (w < 0 || h < 0)
      throw new SvgResizeError('INVALID_SHAPE', 'Rectangle dimensions must be non-negative.');
    if (!w || !h) return [];
    const rx = Math.min(w / 2, attr(node, 'rx', attr(node, 'ry'))),
      ry = Math.min(h / 2, attr(node, 'ry', attr(node, 'rx')));
    if (rx < 0 || ry < 0)
      throw new SvgResizeError('INVALID_SHAPE', 'Corner radii must be non-negative.');
    return parsePath(
      rx && ry
        ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
    );
  }
  const x = attr(node, 'cx'),
    y = attr(node, 'cy'),
    rx = attr(node, node.tag === 'circle' ? 'r' : 'rx'),
    ry = node.tag === 'circle' ? rx : attr(node, 'ry');
  if (rx < 0 || ry < 0) throw new SvgResizeError('INVALID_SHAPE', 'Radii must be non-negative.');
  return rx && ry
    ? parsePath(
        `M${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}Z`,
      )
    : [];
}
export function readSvg(source: string): Document {
  const root = parseXml(source),
    a = root.attrs;
  if (root.selfClosing) throw new SvgResizeError('EMPTY_SVG', 'SVG contains no geometry.');
  const vb = a.viewBox ? numbers(a.viewBox) : undefined;
  if (vb && (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0))
    throw new SvgResizeError(
      'INVALID_VIEWBOX',
      'viewBox must have four numbers and positive dimensions.',
    );
  const width = length(a.width, vb ? (vb[2] * 25.4) / 96 : undefined),
    height = length(a.height, vb ? (vb[3] * 25.4) / 96 : undefined);
  if (!(width > 0 && height > 0 && width <= 1e7 && height <= 1e7))
    throw new SvgResizeError('INVALID_SIZE', 'SVG needs positive finite width and height.');
  let viewport: Matrix = scale(25.4 / 96);
  if (vb) {
    let sx = width / vb[2],
      sy = height / vb[3],
      tx = -vb[0] * sx,
      ty = -vb[1] * sy;
    const par = (a.preserveAspectRatio ?? 'xMidYMid meet').trim();
    if (par !== 'none') {
      const p = /^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/.exec(par);
      if (!p) throw new SvgResizeError('INVALID_VIEWBOX', 'Unsupported preserveAspectRatio.');
      sx = sy = p[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
      tx = -vb[0] * sx + (width - vb[2] * sx) * (p[1] === 'xMin' ? 0 : p[1] === 'xMid' ? 0.5 : 1);
      ty = -vb[1] * sy + (height - vb[3] * sy) * (p[2] === 'YMin' ? 0 : p[2] === 'YMid' ? 0.5 : 1);
    }
    viewport = [sx, 0, 0, sy, tx, ty];
  }
  const validateContent = (node: Element) => {
    if (
      ['script', 'foreignObject', 'iframe', 'animate', 'animateTransform', 'set'].includes(node.tag)
    )
      throw new SvgResizeError('UNSUPPORTED_SVG', 'Active SVG content is unsupported.');
    for (const [key, value] of Object.entries(node.attrs))
      if (/^on/i.test(key) || key === 'href' || key === 'xlink:href' || /url\s*\(/i.test(value))
        throw new SvgResizeError(
          'UNSUPPORTED_SVG',
          'Active content and referenced resources are unsupported.',
        );
    for (const child of node.children) validateContent(child);
  };
  validateContent(root);
  const shapes: Shape[] = [];
  interface Context {
    fill: string;
    stroke: string;
    operation?: string;
    resize?: string;
  }
  const paint = (value: string | undefined, inherited: string, initial: string) => {
    const normalized = value
      ?.replace(/\s*!important\s*$/i, '')
      .trim()
      .toLowerCase();
    if (!normalized || normalized === 'inherit' || normalized === 'unset') return inherited;
    return normalized === 'initial' ? initial : normalized;
  };
  const visit = (
    node: Element,
    parent: Matrix,
    hidden = false,
    inherited: Context = { fill: 'black', stroke: 'none' },
  ) => {
    const a = node.attrs;
    const context: Context = {
      fill: paint(a.fill, inherited.fill, 'black'),
      stroke: paint(a.stroke, inherited.stroke, 'none'),
      operation: a['data-operation']?.trim().toLowerCase() ?? inherited.operation,
      resize: a['data-resize'] ?? inherited.resize,
    };
    if (context.resize && !['hole', 'slot', 'scale'].includes(context.resize))
      throw new SvgResizeError('INVALID_MARKER', 'data-resize must be hole, slot, or scale.');
    for (const [key, value] of Object.entries(a)) {
      if (/^on/i.test(key) || key === 'href' || key === 'xlink:href' || /url\s*\(/i.test(value))
        throw new SvgResizeError(
          'UNSUPPORTED_SVG',
          'Active content and referenced resources are unsupported.',
        );
    }
    if (a.style) {
      for (const part of a.style.split(';').filter((s) => s.trim())) {
        const pair = part.split(':');
        const key = pair[0].trim().toLowerCase(),
          value = pair.slice(1).join(':').trim();
        if (
          ![
            'fill',
            'fill-rule',
            'fill-opacity',
            'stroke',
            'stroke-width',
            'stroke-opacity',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-miterlimit',
            'stroke-dasharray',
            'stroke-dashoffset',
            'opacity',
            'display',
            'visibility',
            'vector-effect',
            'color',
          ].includes(key)
        )
          throw new SvgResizeError(
            'UNSUPPORTED_STYLE',
            `Inline style ${key} is unsupported; export plain SVG geometry first.`,
          );
        if (key === 'fill' || key === 'stroke')
          context[key] = paint(value, inherited[key], key === 'fill' ? 'black' : 'none');
        if ((key === 'display' && value === 'none') || (key === 'visibility' && value === 'hidden'))
          hidden = true;
      }
    }
    if (a['clip-path'] || a.mask || a.filter)
      throw new SvgResizeError(
        'UNSUPPORTED_SVG',
        'Clipping, masks, and filters must be flattened before resizing.',
      );
    hidden = hidden || a.display === 'none' || a.visibility === 'hidden';
    const matrix = mul(parent, transform(a.transform));
    if (['title', 'desc', 'metadata'].includes(node.tag)) return;
    if (node.tag === 'g' || node === root) {
      for (const child of node.children) visit(child, matrix, hidden, context);
      return;
    }
    if (!['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'].includes(node.tag))
      throw new SvgResizeError(
        'UNSUPPORTED_ELEMENT',
        `<${node.tag}> is unsupported. Convert text, references, and other objects to paths first.`,
      );
    if (node.children.length)
      throw new SvgResizeError('UNSUPPORTED_SVG', 'Nested content inside geometry is unsupported.');
    if (!hidden)
      shapes.push({ node, matrix, paths: shapePaths(node), index: shapes.length, ...context });
    if (shapes.length > 2000)
      throw new SvgResizeError('COMPLEXITY_LIMIT', 'At most 2,000 visible shapes are supported.');
  };
  // Root transforms are relocated into the wrapper on export, preserving the source mapping.
  visit(root, IDENTITY);
  if (!shapes.length)
    throw new SvgResizeError('EMPTY_SVG', 'SVG contains no supported visible shapes.');
  return { root, width, height, viewport, shapes };
}

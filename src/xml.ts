import { SvgResizeError } from './types.js';
export interface Element {
  tag: string;
  attrs: Record<string, string>;
  start: number;
  end: number;
  closeStart: number;
  selfClosing: boolean;
  parent?: Element;
  children: Element[];
}
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function decode(value: string): string {
  return value.replace(/&([^;]+);/g, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    if (/^#(?:\d+|x[\da-f]+)$/i.test(entity)) {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff))
        return String.fromCodePoint(code);
    }
    throw new SvgResizeError('INVALID_XML', 'Unsupported XML entity.');
  });
}
/** A non-expanding XML tokenizer. No DOM, entity declarations, or external resources. */
export function parseXml(source: string): Element {
  if (typeof source !== 'string' || source.length > 2_000_000)
    throw new SvgResizeError(
      'INPUT_LIMIT',
      'Expected an SVG string of at most 2,000,000 characters.',
    );
  let i = 0,
    root: Element | undefined;
  const stack: Element[] = [];
  const fail = (message: string): never => {
    throw new SvgResizeError('INVALID_XML', `${message} (character ${i}).`);
  };
  while (i < source.length) {
    if (source[i] !== '<') {
      const end = source.indexOf('<', i),
        text = source.slice(i, end < 0 ? source.length : end);
      if (
        text.trim() &&
        (!stack.length || !['title', 'desc', 'metadata'].includes(stack[stack.length - 1].tag))
      )
        fail('Unexpected text');
      i = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end < 0) fail('Unterminated comment');
      i = end + 3;
      continue;
    }
    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2);
      if (end < 0) fail('Unterminated processing instruction');
      if (!/^<\?xml\s/i.test(source.slice(i, end))) fail('Only the XML declaration is supported');
      i = end + 2;
      continue;
    }
    if (source.startsWith('<!', i)) fail('DOCTYPE and CDATA are not supported');
    const start = i++;
    const closing = source[i] === '/';
    if (closing) i++;
    const name = /^[A-Za-z_][\w:.-]*/.exec(source.slice(i));
    if (!name) fail('Expected element name');
    const tag = name![0];
    i += tag.length;
    if (closing) {
      while (/\s/.test(source[i] ?? '') && i < source.length) i++;
      if (source[i++] !== '>') fail('Malformed closing tag');
      const node = stack.pop();
      if (!node || node.tag !== tag) fail('Mismatched closing tag');
      node!.closeStart = start;
      continue;
    }
    const attrs: Record<string, string> = Object.create(null);
    let selfClosing = false;
    while (i < source.length) {
      const before = i;
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i] === '>') {
        i++;
        break;
      }
      if (source[i] === '/' && source[i + 1] === '>') {
        i += 2;
        selfClosing = true;
        break;
      }
      if (i === before) fail('Attributes must be separated by whitespace');
      const key = /^[A-Za-z_][\w:.-]*/.exec(source.slice(i));
      if (!key) fail('Expected attribute');
      i += key![0].length;
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i++] !== '=') fail('Expected attribute value');
      while (i < source.length && /\s/.test(source[i])) i++;
      const quote = source[i++];
      if (quote !== '"' && quote !== "'") fail('Attributes must be quoted');
      const end = source.indexOf(quote, i);
      if (end < 0) fail('Unterminated attribute');
      if (key![0] in attrs) fail('Duplicate attribute');
      const raw = source.slice(i, end);
      if (raw.includes('<') || /&(?!(?:[\w#]+);)/.test(raw)) fail('Invalid attribute value');
      attrs[key![0]] = decode(raw);
      i = end + 1;
    }
    if (source[i - 1] !== '>') fail('Unterminated opening tag');
    const parent = stack[stack.length - 1];
    const node: Element = {
      tag,
      attrs,
      start,
      end: i,
      closeStart: i,
      selfClosing,
      parent,
      children: [],
    };
    if (parent) parent.children.push(node);
    else {
      if (root) fail('Multiple root elements');
      root = node;
    }
    if (!selfClosing) stack.push(node);
    if (stack.length > 64)
      throw new SvgResizeError('COMPLEXITY_LIMIT', 'SVG nesting exceeds 64 levels.');
  }
  if (stack.length || !root || root.tag !== 'svg') fail('Expected one complete SVG root');
  return root!;
}
export function opening(node: Element, patch: Record<string, string>): string {
  const attrs = { ...node.attrs, ...patch };
  return `<${node.tag}${Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('')}${node.selfClosing ? ' /' : ''}>`;
}
export function applyEdits(
  source: string,
  edits: Array<{ start: number; end: number; value: string }>,
): string {
  let result = source;
  for (const e of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, e.start) + e.value + result.slice(e.end);
  return result;
}

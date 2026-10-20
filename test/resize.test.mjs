import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyzeSvg, resizeSvg, SvgResizeError } from '../dist/index.js';
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">${body}</svg>`;
const outline = '<rect width="100" height="60"/>';
const fixture = svg(
  outline +
    '<circle id="mount" cx="20" cy="20" r="3"/><rect id="slot" x="50" y="20" width="24" height="4"/>',
);
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} should be near ${b}`);
const find = (result, id) => result.features.find((f) => f.elementId === id);
test('detects physical holes and rectangular slots', () => {
  const r = analyzeSvg(fixture);
  assert.equal(r.width, 100);
  assert.equal(r.height, 60);
  assert.equal(r.features.length, 2);
  assert.equal(find(r, 'mount').kind, 'hole');
  near(find(r, 'mount').bounds.width, 6);
  assert.equal(find(r, 'slot').kind, 'slot');
  near(find(r, 'slot').width, 4);
  near(find(r, 'slot').length, 24);
});
test('ordinary scaling is the default and preserves the viewport aspect ratio', () => {
  const r = resizeSvg(fixture, { width: 150 });
  near(r.height, 90);
  assert.equal(r.preserved.length, 0);
  const parsed = analyzeSvg(r.svg);
  near(find(parsed, 'mount').bounds.width, 9);
  near(find(parsed, 'slot').width, 6);
});
test('preserves both features while their centers follow the design', () => {
  const r = resizeSvg(fixture, { width: 150, preserve: { holes: true, slots: true } }),
    parsed = analyzeSvg(r.svg);
  near(find(parsed, 'mount').bounds.width, 6);
  near(find(parsed, 'mount').center[0], 30);
  near(find(parsed, 'slot').width, 4);
  near(find(parsed, 'slot').length, 24);
  near(find(parsed, 'slot').center[0], 93);
  assert.equal(r.preserved.length, 2);
  assert.deepEqual(r.issues, []);
});
test('slot width mode changes length only', () => {
  const r = resizeSvg(fixture, { scale: 2, preserve: { slots: 'width' } }),
    p = analyzeSvg(r.svg);
  near(find(p, 'slot').width, 4);
  near(find(p, 'slot').length, 48);
  near(find(p, 'mount').bounds.width, 12);
});
test('independent x/y scale keeps round holes round', () => {
  const r = resizeSvg(fixture, { scale: [1.5, 0.75], preserve: { holes: true, slots: 'width' } }),
    p = analyzeSvg(r.svg);
  near(find(p, 'mount').bounds.width, 6);
  near(find(p, 'mount').bounds.height, 6);
  near(find(p, 'slot').width, 4);
  near(find(p, 'slot').length, 36);
});
test('rotated slot remains rectangular during nonuniform width preservation', () => {
  const input = svg(
    outline + '<rect id="s" x="35" y="28" width="24" height="4" transform="rotate(30 47 30)"/>',
  );
  const r = resizeSvg(input, { scale: [2, 0.75], preserve: { slots: 'width' } }),
    p = analyzeSvg(r.svg),
    s = find(p, 's');
  assert.ok(s);
  near(s.width, 4);
  near(s.length, 24 * Math.hypot(2 * Math.cos(Math.PI / 6), 0.75 * Math.sin(Math.PI / 6)));
});
test('compound paths retain individual holes, including arcs and implicit commands', () => {
  const input = svg(
    '<path id="compound" fill-rule="evenodd" d="M0 0H100V60H0Z m20 20 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0z M50 20h24v4h-24z"/>',
  );
  const r = resizeSvg(input, { scale: [2, 0.8], preserve: { holes: true, slots: 'width' } }),
    p = analyzeSvg(r.svg);
  assert.equal(p.features.length, 2);
  near(p.features[0].bounds.width, 6);
  near(p.features[0].bounds.height, 6);
  near(p.features[1].width, 4);
  near(p.features[1].length, 48);
  assert.ok(r.svg.includes('A')); // Curves remain curves rather than flattened polylines.
});
test('nested transforms and root transforms preserve physical size', () => {
  const input =
    '<svg width="200mm" height="120mm" viewBox="0 0 100 60" transform="translate(1 0)">' +
    outline +
    '<g transform="translate(10 5) rotate(25)"><g transform="scale(2)"><circle id="h" cx="10" cy="10" r="2"/></g></g></svg>';
  const before = find(analyzeSvg(input), 'h');
  assert.ok(before);
  const r = resizeSvg(input, { scale: [1.5, 0.6], preserve: { holes: true } }),
    after = find(analyzeSvg(r.svg), 'h');
  near(after.bounds.width, before.bounds.width);
  near(after.bounds.height, before.bounds.height);
  near(after.center[0], before.center[0] * 1.5);
  near(after.center[1], before.center[1] * 0.6);
});
test('millimetres, inches, unitless px and nonzero viewBox origins', () => {
  const input =
    '<svg width="4in" height="2in" viewBox="10 20 100 50"><rect x="10" y="20" width="100" height="50"/><circle id="h" cx="30" cy="40" r="2"/></svg>';
  const r = resizeSvg(input, { width: 8, unit: 'in', preserve: { holes: true } }),
    p = analyzeSvg(r.svg);
  near(r.width, 203.2);
  near(r.height, 101.6);
  near(find(p, 'h').bounds.width, 4.064);
  near(find(p, 'h').center[0], 40.64);
  near(
    analyzeSvg('<svg width="96" height="96"><circle cx="48" cy="48" r="20"/></svg>').width,
    25.4,
  );
});
test('source viewBox letterboxing survives export', () => {
  const input =
    '<svg width="100mm" height="100mm" viewBox="0 0 100 50">' +
    outline +
    '<circle id="h" cx="20" cy="20" r="3"/></svg>';
  const before = find(analyzeSvg(input), 'h'),
    r = resizeSvg(input, { scale: [2, 1], preserve: { holes: true } }),
    after = find(analyzeSvg(r.svg), 'h');
  near(after.center[0], before.center[0] * 2);
  near(after.center[1], before.center[1]);
  near(after.bounds.width, 6);
});
test('explicit feature selection overrides group settings and annotations', () => {
  const input = svg(
    outline +
      '<circle id="a" cx="20" cy="20" r="3" data-preserve="all"/><circle id="b" cx="60" cy="20" r="3"/>',
  );
  const a = find(analyzeSvg(input), 'a'),
    b = find(analyzeSvg(input), 'b');
  const result = resizeSvg(input, {
    scale: 2,
    preserve: { features: { [a.id]: 'none', [b.id]: 'all' } },
  });
  const parsed = analyzeSvg(result.svg);
  near(find(parsed, 'a').bounds.width, 12);
  near(find(parsed, 'b').bounds.width, 6);
});
test('explicit markers work for standalone cutouts and scale markers opt out', () => {
  const input = svg(
    '<circle id="h" cx="20" cy="20" r="3" data-resize="hole" data-preserve="all"/><rect id="s" x="40" y="20" width="20" height="4" data-resize="slot"/>',
  );
  const r = resizeSvg(input, { scale: 2, preserve: { slots: true } });
  near(find(analyzeSvg(r.svg), 'h').bounds.width, 6);
  assert.equal(
    analyzeSvg(svg(outline + '<circle cx="20" cy="20" r="3" data-resize="scale"/>')).features
      .length,
    0,
  );
});
const notch = svg('<path id="panel" d="M0 0H30V15H34V0H100V60H0Z"/>');
test('detects open-ended slots and keeps their mouth on the scaled edge', () => {
  const f = analyzeSvg(notch).features[0];
  assert.equal(f.shape, 'notch');
  near(f.width, 4);
  near(f.length, 15);
  const r = resizeSvg(notch, { scale: 2, preserve: { slots: true } }),
    p = analyzeSvg(r.svg).features[0];
  near(p.width, 4);
  near(p.length, 15);
  near(p.bounds.y, 0);
  near(p.center[0], 64);
});
test('open slots preserve width independently of depth, including polygon input', () => {
  const input = svg('<polygon id="p" points="0,0 30,0 30,15 34,15 34,0 100,0 100,60 0,60"/>');
  const r = resizeSvg(input, { scale: 2, preserve: { slots: 'width' } }),
    p = analyzeSvg(r.svg).features[0];
  near(p.width, 4);
  near(p.length, 30);
  near(p.bounds.y, 0);
  assert.equal(r.width, 200);
});
test('protruding tabs are not confused with open slots', () => {
  assert.equal(analyzeSvg(svg('<path d="M0 10H30V0H34V10H100V60H0Z"/>')).features.length, 0);
});
test('preservation checks collisions and strict mode rejects them', () => {
  const input = svg(outline + '<circle id="h" cx="8" cy="8" r="6"/>');
  const r = resizeSvg(input, { scale: 0.2, preserve: { holes: true } });
  assert.ok(r.issues.some((i) => i.code === 'FEATURE_OUTSIDE_OUTLINE'));
  assert.throws(
    () => resizeSvg(input, { scale: 0.2, preserve: { holes: true }, strict: true }),
    (e) => e.code === 'FEATURE_CONFLICT',
  );
  const nearby = svg(outline + '<circle cx="40" cy="30" r="8"/><circle cx="60" cy="30" r="8"/>');
  assert.ok(
    resizeSvg(nearby, { scale: 0.5, preserve: { holes: true } }).issues.some(
      (i) => i.code === 'FEATURE_OVERLAP',
    ),
  );
});
test('open paths, outer contours, and nested islands scale normally', () => {
  const input = svg(
    outline +
      '<path d="M10 10L30 10L30 20"/><circle id="hole" cx="50" cy="30" r="12"/><circle id="island" cx="50" cy="30" r="4"/>',
  );
  const a = analyzeSvg(input);
  assert.equal(a.features.length, 1);
  assert.equal(a.features[0].elementId, 'hole');
});
test('does not mutate caller options; runs in Node without browser globals', () => {
  assert.equal(typeof globalThis.DOMParser, 'undefined');
  const options = Object.freeze({ scale: 2, preserve: Object.freeze({ holes: true }) });
  assert.ok(resizeSvg(fixture, options).svg);
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.deepEqual(cjs.analyzeSvg(fixture), analyzeSvg(fixture));
});
test('a rotated rounded rectangle slot supports width preservation', () => {
  const input = svg(
    outline +
      '<rect id="s" x="40" y="20" width="24" height="4" rx="2" transform="rotate(20 52 22)"/>',
  );
  const r = resizeSvg(input, { scale: 2, preserve: { slots: 'width' } }),
    p = find(analyzeSvg(r.svg), 's');
  near(p.width, 4);
  near(p.length, 48);
});
test('smooth cubic, quadratic, scientific notation, and tight arc flags parse', () => {
  for (const d of [
    'M0 0 C0 20 20 20 20 0S40 -20 40 0Z',
    'M0 0Q10 20 20 0T40 0Z',
    'M1e1 10a5 5 0 015 5L10 10z',
  ])
    assert.ok(resizeSvg(svg(`<path d="${d}"/>`), { scale: 2 }).svg);
});
test('repeated resize works on the generated document', () => {
  const once = resizeSvg(fixture, { scale: 2, preserve: { holes: true, slots: true } });
  const twice = resizeSvg(once.svg, { scale: 0.5, preserve: { holes: true, slots: true } });
  const p = analyzeSvg(twice.svg);
  near(p.width, 100);
  near(find(p, 'mount').bounds.width, 6);
  near(find(p, 'mount').center[0], 20);
});
test('invalid or unsupported input is explicit, never silently discarded', () => {
  for (const input of [
    '<svg>',
    '<svg width="10%" height="10"/>',
    svg('<script>alert(1)</script>'),
    svg('<use href="#x"/>'),
    svg('<text>hello</text>'),
    svg('<path d="M0 0L"/>'),
    svg('<g transform="scale(0)"><circle r="2"/></g>'),
    svg('<style>path{fill:red}</style>'),
    svg('<circle r="2" onclick="x()"/>'),
    '<!DOCTYPE svg><svg/>',
  ])
    assert.throws(() => analyzeSvg(input), SvgResizeError);
  for (const options of [
    { scale: 0 },
    { scale: -1 },
    { scale: NaN },
    { scale: 2, width: 20 },
    {},
    { width: 0 },
    { scale: 2, precision: 1 },
    { scale: 2, preserve: { features: { missing: 'all' } } },
  ])
    assert.throws(() => resizeSvg(fixture, options), SvgResizeError);
});
test('analytic arc and cubic bounds preserve symmetric holes after skew', () => {
  const input = svg(outline + '<path id="h" d="M30 30a5 3 35 1 0 10 0a5 3 35 1 0-10 0z"/>');
  const before = find(analyzeSvg(input), 'h');
  const after = find(
    analyzeSvg(resizeSvg(input, { scale: [1.7, 0.7], preserve: { holes: true } }).svg),
    'h',
  );
  near(after.bounds.width, before.bounds.width);
  near(after.bounds.height, before.bounds.height);
});
test('large and irregular artwork cutouts scale with the design', () => {
  const input = svg(
    outline +
      '<path id="window" d="M10 5L45 5L45 55L10 55Z"/>' +
      '<path id="shard" d="M60 10L68 12L70 18L62 20Z"/>' +
      '<path id="star" d="M80 10L82 15L87 15L83 18L85 23L80 20L75 23L77 18L73 15L78 15Z"/>' +
      '<circle id="mount" cx="70" cy="45" r="2"/>' +
      '<path id="nut" d="M84 42L88 42L90 45.5L88 49L84 49L82 45.5Z"/>' +
      '<circle id="speck" cx="60" cy="30" r="0.1"/>',
  );
  const ids = analyzeSvg(input)
    .features.map((f) => f.elementId)
    .sort();
  assert.deepEqual(ids, ['mount', 'nut']);
  const r = resizeSvg(input, { scale: 0.5, preserve: { holes: true } });
  const p = analyzeSvg(r.svg);
  near(find(p, 'mount').bounds.width, 4);
  assert.equal(find(p, 'window'), undefined);
});
// A 60 x 40 mm panel whose top edge has 6 mm fingers, 3 mm deep (material thickness).
const fingers = (deep) => {
  let d = 'M0 0',
    x = 0;
  for (let i = 0; i < 4; i++) {
    x += 6;
    d += `L${x} 0L${x} ${deep}`;
    x += 6;
    d += `L${x} ${deep}L${x} 0`;
  }
  return `${d}L60 0L60 40L0 40Z`;
};
test('finger joints keep their depth while finger spacing scales', () => {
  const input = svg(`<path id="panel" d="${fingers(3)}"/>`);
  const [joint] = analyzeSvg(input).features;
  assert.equal(joint.shape, 'joint');
  near(joint.width, 3);
  for (const factor of [0.5, 1.5]) {
    const r = resizeSvg(input, { scale: factor, preserve: { slots: 'width' } });
    assert.deepEqual(r.issues, []);
    const [after] = analyzeSvg(r.svg).features;
    assert.equal(after.shape, 'joint');
    near(after.width, 3);
    near(r.features[0].width, 3);
    near(after.bounds.width, joint.bounds.width * factor);
  }
  const plain = analyzeSvg(resizeSvg(input, { scale: 0.5 }).svg).features[0];
  near(plain.width, 1.5);
});
test('a comb of narrow, deep slots keeps slot widths instead', () => {
  const comb = analyzeSvg(
    svg(
      '<path d="M0 0L10 0L10 20L13 20L13 0L30 0L30 20L33 20L33 0L50 0L50 20L53 20L53 0L60 0L60 40L0 40Z"/>',
    ),
  ).features;
  assert.equal(comb.length, 3);
  assert.ok(comb.every((f) => f.shape === 'notch'));
  near(comb[0].width, 3);
});

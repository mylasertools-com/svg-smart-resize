import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSvg, resizeSvg } from '../dist/index.js';
import { examples } from '../demo/examples.js';
const svg = (body) => '<svg width="100mm" height="60mm" viewBox="0 0 100 60">' + body + '</svg>';
const outline = '<rect width="100" height="60"/>';
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, a + ' differs from ' + b);

test('all bundled examples detect the intended features and resize without conflicts', () => {
  for (const [name, example] of Object.entries(examples)) {
    const analyzed = analyzeSvg(example.svg);
    assert.equal(analyzed.features.length, name === 'tag' ? 1 : 5);
    for (const scale of [0.6, 1, 1.5, 1.8]) {
      for (const slots of [false, true, 'width']) {
        const r = resizeSvg(example.svg, { scale, preserve: { holes: true, slots }, strict: true });
        assert.equal(r.issues.length, 0);
      }
    }
  }
});

test('exported notch coordinates independently match the desired physical dimensions', () => {
  const source = svg('<path id="notch" d="M0 0H30V15H34V0H100V60H0Z"/>');
  const out = resizeSvg(source, { scale: 2, preserve: { slots: true } }).svg;
  assert.match(out, /<g transform="matrix\(2 0 0 2 0 0\)">/);
  // Coordinates inside a 2x group: mouth width (33-31)*2=4, depth 7.5*2=15.
  assert.match(out, /d="M0 0L31 0L31 7.5L33 7.5L33 0L100 0L100 60L0 60Z"/);
});

test('primitive correction independently maps the center and radius', () => {
  const out = resizeSvg(svg(outline + '<circle id="h" cx="20" cy="20" r="3"/>'), {
    scale: 2,
    preserve: { holes: true },
  }).svg;
  const circle = out.match(/<circle[^>]+>/)[0];
  assert.match(circle, /r="3"/);
  assert.match(circle, /transform="matrix\(0.5 0 0 0.5 10 10\)"/);
  // Outer scale 2: radius 3*.5*2=3, center (20*.5+10)*2=40.
});

test('clockwise and counterclockwise notches give the same preserved widths', () => {
  for (const d of ['M0 0H30V15H34V0H100V60H0Z', 'M0 0V60H100V0H34V15H30V0Z']) {
    const r = resizeSvg(svg('<path d="' + d + '"/>'), {
      scale: [1.7, 0.9],
      preserve: { slots: 'width' },
      strict: true,
    });
    near(r.features[0].width, 4);
    near(r.features[0].length, 13.5);
    near(analyzeSvg(r.svg).features[0].width, 4);
  }
});

test('rotated open slot keeps full physical dimensions', () => {
  const source = svg(
    '<path transform="translate(35 5) rotate(20) scale(.4)" d="M0 0H30V15H34V0H100V60H0Z"/>',
  );
  const before = analyzeSvg(source).features[0];
  const out = resizeSvg(source, { scale: [1.5, 0.9], preserve: { slots: true }, strict: true });
  const after = analyzeSvg(out.svg).features[0];
  near(before.width, after.width);
  near(before.length, after.length);
});

test('a preserved slot cannot cross through the back of its shrinking panel', () => {
  const source = svg('<path d="M0 0H30V45H34V0H100V60H0Z"/>');
  const r = resizeSvg(source, { scale: 0.5, preserve: { slots: true } });
  assert.ok(r.issues.some((i) => i.code === 'FEATURE_OVERLAP'));
  assert.throws(
    () => resizeSvg(source, { scale: 0.5, preserve: { slots: true }, strict: true }),
    (e) => e.code === 'FEATURE_CONFLICT',
  );
});

test('expanding nested islands cannot silently escape a preserved hole', () => {
  const source = svg(outline + '<circle cx="50" cy="30" r="10"/><circle cx="50" cy="30" r="6"/>');
  const r = resizeSvg(source, { scale: 2, preserve: { holes: true } });
  assert.ok(r.issues.some((i) => i.code === 'FEATURE_OVERLAP'));
});

test('reflections and skew preserve a curved hole without replacing it with lines', () => {
  const source = svg(
    outline +
      '<path id="h" transform="translate(65 10) scale(-1 1) skewX(10)" d="M10 10C10 5 20 5 20 10Q20 17 15 17Q10 17 10 10Z"/>',
  );
  const before = analyzeSvg(source).features[0];
  const out = resizeSvg(source, { scale: [1.8, 0.7], preserve: { holes: true }, strict: true });
  const after = analyzeSvg(out.svg).features[0];
  near(before.bounds.width, after.bounds.width);
  near(before.bounds.height, after.bounds.height);
  assert.match(out.svg, /C/);
  assert.match(out.svg, /Q/);
});

test('closed polyline slots and hidden shapes are handled deliberately', () => {
  const source = svg(
    outline +
      '<polyline id="s" points="20,20 40,20 40,24 20,24 20,20"/><circle cx="70" cy="30" r="4" display="none"/>',
  );
  const out = resizeSvg(source, { scale: 2, preserve: { slots: true } });
  assert.equal(out.features.length, 1);
  near(analyzeSvg(out.svg).features[0].width, 4);
  assert.match(out.svg, /display="none"/);
});

test('metadata cannot carry active SVG content', () => {
  for (const body of [
    '<metadata><script>x</script></metadata>',
    '<metadata><thing onclick="x()"/></metadata>',
    '<metadata><thing href="https://example.com"/></metadata>',
  ]) {
    assert.throws(() => analyzeSvg(svg(outline + body)));
  }
});

test('analysis and resizes are deterministic and do not mutate the input', () => {
  const source = examples.panel.svg;
  const first = resizeSvg(source, { scale: 1.33, preserve: { holes: true, slots: 'width' } });
  assert.deepEqual(
    first,
    resizeSvg(source, { scale: 1.33, preserve: { holes: true, slots: 'width' } }),
  );
  assert.equal(source, examples.panel.svg);
});

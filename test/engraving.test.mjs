import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSvg, resizeSvg } from '../dist/index.js';

const frame = '<rect width="70" height="44"/><circle id="ring" cx="35" cy="6" r="3"/>';
// An outlined D and an E; counters and concave glyph edges are artwork, not cutouts.
const letters =
  '<path id="letters" fill-rule="evenodd" d="M10 18H17C25 18 25 34 17 34H10ZM13 21V31H17C21 31 21 21 17 21ZM28 18H40V21H31V24H38V27H31V31H40V34H28Z"/>';
const svg = (body) => '<svg width="70mm" height="44mm" viewBox="0 0 70 44">' + body + '</svg>';
const input = svg(
  '<g data-operation="cut" fill="none" stroke="red">' +
    frame +
    '</g><g data-operation="engrave" fill="blue" stroke="none"><g transform="translate(1 0)">' +
    letters +
    '</g></g>',
);
const check = (source) => {
  assert.equal(analyzeSvg(source).features.length, 1);
  for (const scale of [0.75, 1.5, [1.5, 1.2]]) {
    const result = resizeSvg(source, {
      scale,
      preserve: { holes: true, slots: true },
      strict: true,
    });
    assert.equal(result.preserved.length, 1);
    assert.equal(result.features[0].elementId, 'ring');
    assert.ok(Math.abs(result.features[0].bounds.width - 6) < 1e-6);
    assert.ok(
      result.svg.includes(letters),
      'Every glyph and counter must remain byte-for-byte intact inside the scaled wrapper.',
    );
    assert.deepEqual(result.issues, []);
  }
};
test('inherited engraving operation protects compound glyphs and nested groups', () =>
  check(input));
test('filled unstroked artwork inside a stroke-only part scales without operation labels', () =>
  check(input.replaceAll(/ data-operation="[^"]+"/g, '')));
test('score layers scale intact even when their paths have cut-like styling', () =>
  check(
    input.replace(
      'data-operation="engrave" fill="blue" stroke="none"',
      'data-operation="score" fill="none" stroke="red"',
    ),
  ));
test('inline inherited paint is respected when classifying artwork', () =>
  check(
    input
      .replaceAll(/ data-operation="[^"]+"/g, '')
      .replace(
        'fill="blue" stroke="none"',
        'fill="none" stroke="red" style="fill: blue;stroke: none"',
      ),
  ));
test('group scale marker excludes all descendants from feature detection', () =>
  check(
    input
      .replace('data-operation="engrave"', 'data-resize="scale"')
      .replace('fill="blue" stroke="none"', 'fill="none" stroke="red"'),
  ));
test('explicit cut intent overrides the artwork heuristic', () => {
  const source = svg(
    '<g fill="none" stroke="red"><rect width="70" height="44"/></g><g data-operation="engrave" fill="blue"><g data-operation="cut"><circle id="ring" cx="35" cy="6" r="3"/></g>' +
      letters +
      '</g>',
  );
  assert.equal(analyzeSvg(source).features.length, 1);
  assert.equal(analyzeSvg(source).features[0].elementId, 'ring');
});
test('a child feature marker can explicitly override a group scale marker', () => {
  const source = svg(
    '<rect width="70" height="44"/><g data-resize="scale"><circle data-resize="hole" cx="35" cy="6" r="3"/>' +
      letters +
      '</g>',
  );
  assert.equal(analyzeSvg(source).features.length, 1);
});

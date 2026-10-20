import { analyzeSvg, resizeSvg } from '../dist/index.js';
import { examples } from './examples.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n.toFixed(2));
let source,
  analysis,
  result,
  baseName = 'slotted-panel';
const imageUrls = new Map();

function setImage(id, svg) {
  const previous = imageUrls.get(id);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  imageUrls.set(id, url);
  $(id).src = url;
  if (previous) URL.revokeObjectURL(previous);
}
function dimensions(feature) {
  if (!feature) return '—';
  if (feature.kind === 'slot') return fmt(feature.width) + ' × ' + fmt(feature.length) + ' mm';
  return fmt(feature.bounds.width) + ' × ' + fmt(feature.bounds.height) + ' mm';
}
function fitPreviews() {
  if (!analysis || !result) return;
  const canvas = $('smart-img').parentElement;
  const ratio = Math.min(
    (canvas.clientWidth - 38) / Math.max(analysis.width, result.width),
    (canvas.clientHeight - 32) / Math.max(analysis.height, result.height),
  );
  for (const [id, value] of [
    ['original-img', analysis],
    ['ordinary-img', result],
    ['smart-img', result],
  ]) {
    $(id).style.width = value.width * ratio + 'px';
    $(id).style.height = value.height * ratio + 'px';
  }
}
function update() {
  try {
    const width = Number($('width').value),
      height = Number($('height').value);
    const preserve = {
      holes: $('holes').checked,
      slots: $('slots').value === 'width' ? 'width' : $('slots').value === 'all',
    };
    const ordinary = resizeSvg(source, { width, height });
    result = resizeSvg(source, { width, height, preserve });
    $('error').hidden = true;
    $('download').disabled = false;
    setImage('ordinary-img', ordinary.svg);
    setImage('smart-img', result.svg);
    for (const [id, value] of [
      ['original-size', analysis],
      ['ordinary-size', ordinary],
      ['smart-size', result],
    ]) {
      $(id).textContent = fmt(value.width) + ' × ' + fmt(value.height) + ' mm';
    }
    $('feature-count').textContent = analysis.features.length + ' features detected';
    $('issues').textContent = result.issues.map((issue) => issue.message).join(' ');
    $('features').replaceChildren();
    analysis.features.slice(0, 12).forEach((feature, i) => {
      const row = document.createElement('div');
      row.className = 'feature-row';
      const title =
        (feature.kind === 'hole'
          ? 'Hole'
          : feature.shape === 'notch'
            ? 'Open slot'
            : feature.shape === 'joint'
              ? 'Finger joint'
              : 'Enclosed slot') +
        ' · ' +
        (feature.elementId || '#' + (i + 1));
      const values = [
        title,
        dimensions(feature),
        dimensions(ordinary.features.find((f) => f.id === feature.id)),
        dimensions(result.features.find((f) => f.id === feature.id)),
      ];
      values.forEach((value) => {
        const cell = document.createElement('span');
        cell.textContent = value;
        row.append(cell);
      });
      $('features').append(row);
    });
    if (!analysis.features.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent =
        'No enclosed holes or rectangular slots detected. You can still resize this SVG.';
      $('features').append(empty);
    }
    $('code').textContent =
      "import { resizeSvg } from '@mylasertools/svg-smart-resize';\n\nconst result = resizeSvg(svg, {\n  width: " +
      fmt(width) +
      ', height: ' +
      fmt(height) +
      ', // mm\n  preserve: { holes: ' +
      preserve.holes +
      ', slots: ' +
      (preserve.slots === 'width' ? "'width'" : preserve.slots) +
      ' }\n});\n\n// result.svg · result.features · result.issues';
    fitPreviews();
  } catch (error) {
    result = undefined;
    $('error').textContent = error.message;
    $('error').hidden = false;
    $('download').disabled = true;
  }
}
function load(svg, name) {
  const next = analyzeSvg(svg);
  source = svg;
  analysis = next;
  baseName = name;
  // Render a validated export in an image context, never insert file markup into the page.
  setImage('original-img', resizeSvg(source, { scale: 1 }).svg);
  $('scale').value = '150';
  $('scale-label').textContent = '150%';
  $('width').value = fmt(analysis.width * 1.5);
  $('height').value = fmt(analysis.height * 1.5);
  update();
}
function loadExample() {
  const example = examples[$('example').value];
  $('example-description').textContent = example.description;
  load(example.svg, $('example').value);
}
$('example').addEventListener('change', loadExample);
$('reset').addEventListener('click', () => {
  $('holes').checked = true;
  $('slots').value = 'width';
  $('lock').checked = true;
  $('file').value = '';
  loadExample();
});
$('scale').addEventListener('input', () => {
  const scale = Number($('scale').value) / 100;
  $('scale-label').textContent = $('scale').value + '%';
  $('width').value = fmt(analysis.width * scale);
  $('height').value = fmt(analysis.height * scale);
  update();
});
for (const axis of ['width', 'height'])
  $('' + axis).addEventListener('input', () => {
    if ($('lock').checked) {
      const other = axis === 'width' ? 'height' : 'width';
      $(other).value = fmt((Number($(axis).value) * analysis[other]) / analysis[axis]);
    }
    $('scale-label').textContent = $('lock').checked
      ? fmt((Number($(axis).value) / analysis[axis]) * 100) + '%'
      : 'Custom';
    update();
  });
for (const id of ['holes', 'slots']) $(id).addEventListener('change', update);
$('lock').addEventListener('change', () => {
  $('scale-label').textContent = $('lock').checked
    ? fmt((Number($('width').value) / analysis.width) * 100) + '%'
    : 'Custom';
});
$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Please choose an SVG smaller than 2 MB.');
    load(await file.text(), file.name.replace(/\.svg$/i, ''));
    $('example-description').textContent = file.name + ' · processed locally';
  } catch (error) {
    $('error').hidden = false;
    $('error').textContent = error.message;
  }
});
$('download').addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = baseName + '-smart-resized.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
new ResizeObserver(fitPreviews).observe($('smart-img').parentElement);
loadExample();

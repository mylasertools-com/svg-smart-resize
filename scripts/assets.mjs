import { mkdir, writeFile } from 'node:fs/promises';
import { examples } from '../demo/examples.js';
import { resizeSvg } from '../dist/index.js';

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const text = (x, y, value, size = 16, fill = '#172f2d', weight = 400) =>
  '<text x="' +
  x +
  '" y="' +
  y +
  '" font-size="' +
  size +
  '" fill="' +
  fill +
  '" font-weight="' +
  weight +
  '">' +
  esc(value) +
  '</text>';
const source = examples.panel.svg;
const ordinary = resizeSvg(source, { scale: 1.5 });
const smart = resizeSvg(source, { scale: 1.5, preserve: { holes: true, slots: 'width' } });
function design(svg, x, y, w, h) {
  return svg
    .replace(/<svg\b/, '<svg x="' + x + '" y="' + y + '"')
    .replace(/width="[^"]*"/, 'width="' + w + '"')
    .replace(/height="[^"]*"/, 'height="' + h + '"');
}
const canvas = (w, h, content) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' +
  w +
  '" height="' +
  h +
  '" viewBox="0 0 ' +
  w +
  ' ' +
  h +
  '" role="img"><title>SVG Smart Resize — change the size, keep the fit</title><style>text{font-family:Inter,Segoe UI,Arial,sans-serif}</style>' +
  content +
  '</svg>\n';
await mkdir('docs', { recursive: true });
await writeFile(
  'docs/hero.svg',
  canvas(
    1280,
    510,
    '<rect width="1280" height="510" rx="24" fill="#142f2b"/><circle cx="1060" cy="245" r="300" fill="#193d35"/><circle cx="1060" cy="245" r="230" fill="none" stroke="#285346" stroke-dasharray="3 10"/>' +
      text(62, 66, 'MYLASERTOOLS  /  OPEN SOURCE', 13, '#96bba6', 600) +
      text(62, 159, 'Change the size.', 53, '#f2f7eb', 600) +
      text(62, 222, 'Keep the fit.', 53, '#b8f0bd', 600) +
      text(64, 283, 'SVG resizing that respects your holes and slots.', 19, '#bfd0c2') +
      '<rect x="62" y="325" width="470" height="52" rx="9" fill="#21443b"/>' +
      text(81, 357, 'npm i @mylasertools/svg-smart-resize', 18, '#d7ebd5', 500) +
      text(64, 443, 'TINY BUNDLE     /     ZERO DEPENDENCIES     /     MIT', 12, '#93b5a0', 600) +
      '<rect x="751" y="64" width="399" height="350" rx="20" fill="#eaf0e3" transform="rotate(-6 950 245)"/>' +
      '<g transform="rotate(-6 950 245)">' +
      text(785, 111, '120 → 180 mm', 17, '#486153', 500) +
      design(smart.svg, 782, 150, 338, 180.267) +
      '<path d="M947 135v208" stroke="#15735c" stroke-dasharray="3 4" opacity=".5"/>' +
      '<rect x="817" y="358" width="268" height="33" rx="16" fill="#c9e7c9"/>' +
      text(835, 380, '4 mm slots. Still 4 mm slots.', 16, '#1b674f', 600) +
      '</g>',
  ),
);
let body =
  '<rect width="1280" height="614" rx="20" fill="#f3f5ef"/>' +
  text(40, 52, 'SCALE THE DESIGN. PRESERVE THE DIMENSIONS THAT MATTER.', 15, '#47705d', 600) +
  text(40, 99, 'One design. Three very different fits.', 32, '#172f2d', 600);
const cards = [
  {
    x: 40,
    title: 'Original',
    tag: '120 × 64 mm',
    svg: source,
    w: 225,
    h: 120,
    hole: 'Ø 6 mm',
    slot: '4 × 24 mm',
    note: 'The starting geometry',
    tint: '#ffffff',
    accent: '#67796c',
  },
  {
    x: 449,
    title: 'Ordinary resize',
    tag: '180 × 96 mm',
    svg: ordinary.svg,
    w: 337.5,
    h: 180,
    hole: 'Ø 9 mm',
    slot: '6 × 36 mm',
    note: 'Hole and slot width both grow',
    tint: '#ffffff',
    accent: '#ad6c43',
  },
  {
    x: 858,
    title: 'Smart resize',
    tag: '180 × 96 mm',
    svg: smart.svg,
    w: 337.5,
    h: 180,
    hole: 'Ø 6 mm',
    slot: '4 × 36 mm',
    note: 'Same hole. Same slot width.',
    tint: '#eaf3e8',
    accent: '#1b7955',
  },
];
for (const card of cards) {
  body +=
    '<rect x="' +
    card.x +
    '" y="134" width="382" height="377" rx="14" fill="' +
    card.tint +
    '" stroke="#d9e2d6"/>' +
    text(card.x + 24, 173, card.title, 20, '#172f2d', 600) +
    text(card.x + 24, 198, card.tag, 13, '#738171') +
    design(card.svg, card.x + (382 - card.w) / 2, 237 + (180 - card.h) / 2, card.w, card.h) +
    '<line x1="' +
    (card.x + 24) +
    '" y1="444" x2="' +
    (card.x + 358) +
    '" y2="444" stroke="#dce5d8"/>' +
    text(card.x + 24, 474, 'HOLES  ' + card.hole, 14, card.accent, 600) +
    text(card.x + 179, 474, 'SLOTS  ' + card.slot, 14, card.accent, 600) +
    text(card.x + 191, 541, card.note, 14, card.accent, 500).replace(
      '<text ',
      '<text text-anchor="middle" ',
    );
}
body += text(
  40,
  585,
  '150% scale • preserve: { holes: true, slots: "width" } • Same physical scale in every panel',
  13,
  '#647763',
);
await writeFile('docs/before-after.svg', canvas(1280, 614, body));
console.log('Generated docs/hero.svg and docs/before-after.svg from the package output.');

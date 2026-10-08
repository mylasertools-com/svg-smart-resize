# API reference

The package exports `analyzeSvg`, `resizeSvg`, `SvgResizeError`, and TypeScript types.

## analyzeSvg(svg, options?)

Accepts an SVG string and returns `{ width, height, unit: 'mm', features }`. No input mutation or browser globals are involved.

`options.tolerance` controls curve sampling for containment checks, in millimetres. Default: `0.02`; allowed range: `0.0001–1`. Exact curve bounds and output curves do not use this approximation.

## resizeSvg(svg, options)

| Option              | Type                           | Default / behavior                                                 |
| :------------------ | :----------------------------- | :----------------------------------------------------------------- |
| `width`             | number                         | Target viewport width                                              |
| `height`            | number                         | Target viewport height; omit either dimension to keep aspect ratio |
| `unit`              | `'mm' \| 'cm' \| 'in' \| 'px'` | `'mm'`; applies to target width/height                             |
| `scale`             | number or `[x, y]`             | Alternative to width/height; cannot combine them                   |
| `preserve.holes`    | boolean                        | `false`                                                            |
| `preserve.slots`    | boolean or `'width'`           | `false`; `true` keeps width and length                             |
| `preserve.features` | Record of feature ID to mode   | Modes: `'all'`, `'width'`, `'none'`                                |
| `strict`            | boolean                        | `false`; `true` throws on reported geometric conflicts             |
| `precision`         | number                         | `6` decimal places in serialized numbers; integer 2–12             |
| `tolerance`         | number                         | `0.02` mm for detection and conflict checks                        |

At least one target dimension or a scale is required. Dimensions must be positive and at most 10,000,000 mm. Scale factors must be between 0.000001 and 1,000,000.

Widths and lengths refer to geometric centerlines, without stroke, kerf, or offsets.

### Result

```ts
{
  svg: string;
  width: number;         // mm
  height: number;        // mm
  unit: 'mm';
  scale: [number, number];
  features: Feature[];   // output measurements, with the source IDs
  preserved: { id: string; mode: 'all' | 'width' }[];
  issues: Issue[];
}
```

`preserved` contains only features actually preserved, so entries use `'all'` or `'width'`. Features remain in `result.features` even if a conflict means they are no longer enclosed after the resize.

### Feature

```ts
{
  id: string;           // e.g. "shape-1:path-0"
  elementId?: string;   // the SVG element's id, if present
  subpath: number;      // zero-based contour index
  kind: 'hole' | 'slot';
  shape: 'interior' | 'notch';
  bounds: { x: number; y: number; width: number; height: number }; // mm
  center: [number, number]; // center of the axis-aligned bounds, mm
  width?: number;       // slot short dimension, mm
  length?: number;      // enclosed slot long dimension, or open slot depth, mm
  axis?: [number, number]; // unit vector along slot length/depth
  source: 'detected' | 'marked';
}
```

Feature IDs describe source traversal order; they are not globally unique or persistent identifiers. Use them with the exact SVG analyzed. For ordinary nonuniform scaling of a rotated slot, `width` describes its transformed short edge; the resulting parallelogram may no longer be classified as an orthogonal slot on re-analysis.

### Annotations

- `data-resize="hole"`: classify a closed contour as a hole, including standalone geometry.
- `data-resize="slot"`: classify an orthogonal rectangle or rounded `rect` as a slot.
- `data-resize="scale"`: exclude an element or group's descendant contours from feature detection.
- `data-operation="engrave"` or `"score"`: scale the layer normally and exclude it from cut-feature detection.
- `data-operation="cut"`: explicitly identify cutting geometry, overriding the filled-artwork heuristic.
- `data-preserve="all|width|none"`: request a default mode for features on that element.

`data-resize` and `data-operation` inherit through groups; the nearest declaration wins. Explicit `hole`/`slot` markers override operation-based exclusion. `data-preserve` still applies only to the individual geometry element. Width mode is valid only for slots. Arbitrary closed shapes, including curved slots, can be marked as holes and preserved as a whole.

### Position and rotation

`all` retains the original physical geometry and orientation around the scaled feature center. `width` follows the scaled long-axis vector, with the short-axis vector kept perpendicular at unit length. These policies can differ under nonuniform scaling.

Open slots use the midpoint of their mouth as the anchor, rather than the center. For rectangular openings on diagonal edges, a nonuniform resize can change how the corrected mouth connects to adjacent edges; inspect the result.

Nested islands and decorative paths scale normally unless explicitly marked as features. They are not automatically carried along as part of a preserved enclosing cutout.

Filled, unstroked objects inside stroke-only part outlines, including their nested counters, are treated as artwork unless explicitly marked as cutting geometry or features. Engraving is excluded from the containment tree and conflict checks. Unlabelled, stroke-only letters remain ambiguous; mark their group explicitly.

## Errors and conflicts

```ts
import { resizeSvg, SvgResizeError } from '@mylasertools/svg-smart-resize';

try {
  const result = resizeSvg(svg, {
    scale: 0.6,
    preserve: { holes: true, slots: true },
    strict: true,
  });
} catch (error) {
  if (error instanceof SvgResizeError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

Reported issues have `code`, `featureId`, and `message`. Codes are `FEATURE_OUTSIDE_OUTLINE` and `FEATURE_OVERLAP`. With `strict: true`, any issue throws `SvgResizeError` with code `FEATURE_CONFLICT`.

Malformed XML/path data, invalid sizes/options, unsupported SVG features, singular transforms, unknown feature IDs, and exceeded complexity limits also throw `SvgResizeError`. Errors describe the unsupported input instead of silently deleting it.

Checks are approximate and don't resolve collisions. Split or simplify designs with overlapping source contours, and review the exported SVG before fabrication. This parser is not a general-purpose HTML/SVG sanitizer: render untrusted SVG in an isolated image context.

## Input limits

Limits bound analysis work and memory: 2 million source characters, 64 XML nesting levels, 2,000 visible shapes/closed contours, 100,000 path commands per path, 20,000 samples per contour, and 100,000 samples per analysis. Containment and conflict checks each have a 20 million pair-work budget. Coordinates must be finite and within the parser's supported range.

For larger drawings, process individual parts separately. Analysis is synchronous; use a Web Worker if your UI needs to remain responsive on complex input.

## CommonJS

```js
const { resizeSvg } = require('@mylasertools/svg-smart-resize');
```

The ESM and CommonJS entry points share the same behavior. Runtime code uses ES2020 language features and works without `window` or `DOMParser`.

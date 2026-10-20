# Changelog

## 0.1.1

- Only detect hardware-like holes: small next to their part, convex and point-symmetric. Large or irregular decorative cutouts now scale with the design instead of keeping their size.
- Detected slots must be no wider than half their part, so large rectangular windows scale normally.
- Ignore cutouts smaller than 0.5 mm.

## 0.1.0

First release.

- Keep engraving and score layers intact, including outlined text and nested SVG group intent.
- Analyze enclosed holes, rectangular slots, and straight-sided open slots.
- Resize SVGs with optional full-feature or slot-width preservation.
- Support compound paths, nested transforms, physical units, and nonuniform scales.
- Report preservation conflicts, with optional strict rejection.
- Ship dependency-free ESM/CommonJS builds and TypeScript declarations.
- Include an interactive local-file demo and generated before/after illustrations.

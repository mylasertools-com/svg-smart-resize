# Contributing

Small, dependable geometry tools are the goal. Bug reports with a minimal SVG, requested dimensions, and expected hole/slot measurements are especially useful.

1. Use Node.js 20 or newer and run `npm ci`.
2. Add a small regression fixture for geometry changes.
3. Run `npm run check`, `npm run test:package`, and `npm run format:check`.
4. For demo changes, run `npm run demo` and inspect desktop and mobile layouts.
5. If example behavior changes, run `npm run assets`.

Runtime dependencies need a strong reason. The complete ESM bundle has a 13,000-byte gzip budget. Preserve Bézier curves and arcs in exported SVG; approximation is for analysis only.

Changes should document unsupported input explicitly. Don't silently drop geometry or claim fabrication correctness from a bounding-box check.

## Project layout

- `src/xml.ts`, `svg.ts`: constrained SVG reading and physical units.
- `src/path.ts`, `matrix.ts`, `geometry.ts`: path geometry and affine transforms.
- `src/analyze.ts`: contour nesting and feature detection.
- `src/index.ts`: preservation policies, export, and conflict reporting.
- `demo/`: a framework-free consumer of the built npm entry point.
- `test/`: Node's built-in test runner; no test framework dependency.
- `scripts/assets.mjs`: actual-output illustrations for the README.

## Releasing

For the initial npm publication, follow [the first-release checklist](docs/RELEASING.md).

The repository includes a manual `publish.yml` workflow for npm trusted publishing. Configure an npm trusted publisher for GitHub organization `mylasertools-com`, repository `svg-smart-resize`, workflow `publish.yml`, with direct publishing allowed. This requires npm account/package access; the workflow file alone does not enable publishing.

1. Update the version and changelog, run checks, and commit on `main`.
2. Run the Publish workflow from `main`, with the exact package version as its input.
3. Verify the npm version, then create a GitHub release with tag `v<version>`.

The first npm publication may need an authenticated local `npm publish --access public` before a trusted publisher can be configured. Do not commit registry tokens.

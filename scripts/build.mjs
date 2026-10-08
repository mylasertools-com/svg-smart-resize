import { readdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
await Promise.all([
  build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
  }),
  build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.cjs',
    bundle: true,
    minify: true,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2020',
  }),
]);

// Both module systems get declarations with matching import resolution.
for (const name of await readdir('dist')) {
  if (!name.endsWith('.d.ts')) continue;
  const text = await readFile('dist/' + name, 'utf8');
  await writeFile('dist/' + name.replace('.d.ts', '.d.cts'), text.replaceAll(".js'", ".cjs'"));
}

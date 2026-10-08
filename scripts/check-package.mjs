import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'svg-smart-resize-consumer-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check using npm run test:package.');
const run = (args, cwd) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'Consumer check failed.');
  return r.stdout;
};
try {
  const packed = JSON.parse(
    run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root),
  )[0];
  assert.ok(packed.files.some((f) => f.path === 'LICENSE'));
  assert.ok(packed.files.some((f) => f.path === 'dist/index.js'));
  assert.ok(!packed.files.some((f) => /^(src|demo|test|node_modules)\//.test(f.path)));
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  run(
    [
      npm,
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, packed.filename),
    ],
    consumer,
  );
  const svg =
    '<svg width="100mm" height="60mm" viewBox="0 0 100 60"><rect width="100" height="60"/><circle cx="20" cy="20" r="3"/></svg>';
  const assertions =
    'const r = resizeSvg(' +
    JSON.stringify(svg) +
    ", {scale:2,preserve:{holes:true}}); if(r.width !== 200 || Math.abs(r.features[0].bounds.width-6)>0.0001) throw Error('Incorrect packed result');";
  await writeFile(
    join(consumer, 'esm.mjs'),
    "import { resizeSvg } from '@mylasertools/svg-smart-resize';" + assertions,
  );
  await writeFile(
    join(consumer, 'common.cjs'),
    "const { resizeSvg } = require('@mylasertools/svg-smart-resize');" + assertions,
  );
  run([join(consumer, 'esm.mjs')], consumer);
  run([join(consumer, 'common.cjs')], consumer);
  const typed =
    "import { resizeSvg, analyzeSvg, type ResizeOptions } from '@mylasertools/svg-smart-resize';\nconst options: ResizeOptions = {scale:[2,1],preserve:{slots:'width'}};\nconst result: string = resizeSvg('<svg/>',options).svg;\nconst width: number = analyzeSvg('<svg/>').width;\n";
  await writeFile(join(consumer, 'types.mts'), typed);
  await writeFile(join(consumer, 'types.cts'), typed);
  run(
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--target',
      'ES2020',
      'types.mts',
      'types.cts',
    ],
    consumer,
  );
  const manifest = JSON.parse(
    await readFile(
      join(consumer, 'node_modules/@mylasertools/svg-smart-resize/package.json'),
      'utf8',
    ),
  );
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  console.log(
    'Packed consumer passed: ESM, CommonJS, TypeScript (MTS/CTS), zero runtime dependencies.',
  );
  console.log(packed.files.length + ' files, ' + packed.size + ' bytes packed.');
} finally {
  // mkdtemp created this exact private directory; never derive a deletion target from package data.
  if (
    dirname(resolve(temporary)) !== resolve(tmpdir()) ||
    !basename(temporary).startsWith('svg-smart-resize-consumer-')
  )
    throw new Error('Unexpected temporary cleanup path.');
  await rm(temporary, { recursive: true, force: true });
}

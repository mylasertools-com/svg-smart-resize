import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const source = readFileSync(new URL('../dist/index.js', import.meta.url));
const bytes = gzipSync(source, { level: 9 }).length;
console.log(
  `ESM: ${source.length.toLocaleString()} bytes minified / ${bytes.toLocaleString()} bytes gzip. Zero runtime dependencies.`,
);
if (bytes > 12000) throw new Error(`Bundle exceeds the 12,000 byte gzip budget: ${bytes}`);

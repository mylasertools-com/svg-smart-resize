import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') {
      res.writeHead(302, { Location: '/demo/' });
      res.end();
      return;
    }
    const path = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (
      !path.startsWith(root + sep) ||
      !['demo', 'dist', 'docs'].some((dir) => path.startsWith(resolve(root, dir) + sep))
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(4173, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:4173/demo/'));

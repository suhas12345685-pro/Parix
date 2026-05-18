import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.env.AEGIS_DIST_DIR || 'aegis/dist');
const port = Number(process.env.PORT || process.env.AEGIS_UI_PORT || 3000);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', `http://localhost:${port}`).pathname);
  if (pathname === '/healthz' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'aegis' }));
    return;
  }

  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const path = resolve(join(root, requested));
  const file = path.startsWith(root) && existsSync(path) ? path : join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`[AEGIS] Static dashboard listening on http://0.0.0.0:${port}`);
});

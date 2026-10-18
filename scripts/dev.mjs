import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname, relative as relativePath } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const allowed = new Set(['index.html', 'src', 'assets']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep) || !allowed.has(relativePath(root, target).split(sep)[0]) || !(await stat(target)).isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '4173 端口已被占用。请关闭旧预览后重试；不要更换端口，以免切换本地数据空间。' : error.message);
  process.exitCode = 1;
});
server.listen(4173, '127.0.0.1', () => console.log('Starry Wall → http://localhost:4173'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));

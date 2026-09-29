// Local preview: static files + the same /api/legion handler as on Vercel.   node dev.mjs  → http://localhost:8769
import http from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import handler from './api/legion.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.otf': 'font/otf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/legion') { const r = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); } }; return handler(req, r); }
  const p = path.join(root, url === '/' ? 'index.html' : decodeURIComponent(url));
  try { await stat(p); res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(p)); } catch { res.statusCode = 404; res.end('not found'); }
}).listen(8769, () => console.log('http://localhost:8769'));

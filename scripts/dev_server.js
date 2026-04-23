#!/usr/bin/env node
// Minimal local dev server for static files under public/.
// Does NOT run API routes — use `vercel dev` for that.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, '../public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const PORT = process.env.PORT || 5173;

const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  // vercel rewrites (static)
  if (url === '/away' || url === '/cli' || url === '/marquee' || url === '/yell') url = '/index.html';
  if (url === '/') url = '/index.html';
  if (url.startsWith('/api/')) {
    res.statusCode = 501;
    res.setHeader('content-type', 'text/plain');
    res.end('API routes not served by dev_server.js. Use `vercel dev` instead.');
    return;
  }
  const path = resolve(PUBLIC, '.' + url);
  if (!path.startsWith(PUBLIC) || !existsSync(path) || !statSync(path).isFile()) {
    res.statusCode = 404;
    res.end('not found: ' + url);
    return;
  }
  res.setHeader('content-type', MIME[extname(path)] || 'application/octet-stream');
  res.end(readFileSync(path));
});

server.listen(PORT, () => {
  console.log(`slidetackled dev — http://localhost:${PORT}`);
});

// Servidor estático de e2e: sirve dist-e2e con las cabeceras del bloque `/*` de public/_headers.
// `astro preview` no aplica _headers (y en Astro 7 se desacopla a segundo plano si no hay TTY),
// así que el e2e usa este servidor para probar la CSP real. Rutas como Cloudflare Pages: /x -> x.html.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist-e2e');
const port = Number(process.env.PORT ?? 4321);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.xml': 'application/xml' };

const globalBlock = /^\/\*\n((?:[ \t]+.+\n?)+)/m.exec(readFileSync('public/_headers', 'utf8'))?.[1] ?? '';
const headers = Object.fromEntries(globalBlock.split('\n').filter(Boolean).map((l) => {
  const i = l.indexOf(':');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

const find = (path) => {
  const clean = normalize(path).replace(/^(\.\.[/\\])+/, '');
  for (const c of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const f = join(root, c);
    if (f.startsWith(root) && existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
};

createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { ...headers, 'Content-Type': 'text/plain' }).end('Bad request');
    return;
  }
  const file = find(pathname);
  const target = file ?? join(root, '404.html');
  res.writeHead(file ? 200 : 404, { ...headers, 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(target));
}).listen(port, () => console.log(`e2e server http://localhost:${port}`));

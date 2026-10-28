import { existsSync, statSync } from 'node:fs';
import { posix, resolve, sep } from 'node:path';
import { DIST } from './helpers';

const SKIP = /^(mailto:|tel:|https?:|data:|javascript:)/i;

/**
 * Fichero de dist al que apunta una ruta absoluta del sitio (format: 'file'), o null.
 * Lanza URIError si la ruta lleva un %-escape inválido. Nunca sale de dist/.
 */
export function fileFor(pathname: string): string | null {
  const p = decodeURIComponent(pathname);
  const candidates = p === '/' ? ['index.html'] : [p.slice(1), `${p.slice(1)}.html`];
  for (const c of candidates) {
    const f = resolve(DIST, c);
    if (!f.startsWith(resolve(DIST) + sep)) continue; // `/..%2fpackage.json`
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

/** Referencias internas (href/src) de un documento que no resuelven. `ids` da los ids de cada fichero de dist. */
export function brokenLinks(
  pageUrl: string,
  doc: Document,
  idsOf: (file: string) => Set<string>,
): string[] {
  const refs = [...doc.querySelectorAll('[href], [src]')].map((e) => e.getAttribute('href') ?? e.getAttribute('src') ?? '');
  const broken: string[] = [];
  for (const ref of refs) {
    if (ref === '' || SKIP.test(ref) || ref.startsWith('//')) continue;
    const base = new URL(`https://x.test${pageUrl}`);
    const u = new URL(ref, base);
    // `/\evil.example/` o `\\evil.example` resuelven a otro host: no es un enlace interno.
    if (u.origin !== base.origin) { broken.push(ref); continue; }
    try {
      const hash = u.hash.slice(1);
      const file = fileFor(u.pathname);
      if (!file) { broken.push(ref); continue; }
      if (hash && file.endsWith('.html') && !idsOf(file).has(decodeURIComponent(hash))) broken.push(ref);
    } catch { // %zz: URIError
      broken.push(ref);
    }
  }
  return broken;
}
export const pageUrlOf = (rel: string): string => `/${posix.normalize(rel.replace(/\\/g, '/'))}`.replace(/\.html$/, '');

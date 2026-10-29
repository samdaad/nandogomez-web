// Adversario P10 (dist): sitemap/robots/canonical coherentes con lo que existe, OG resoluble y único,
// y todo recurso que referencia dist cabe en la CSP real de dist/_headers.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, distFiles, pages, read } from './helpers';

const all = pages().map((p) => ({ ...p, name: relative(DIST, p.file) }));
const indexable = all.filter((p) => p.name !== '404.html');
const meta = (d: Document, sel: string): string => d.querySelector(sel)?.getAttribute('content') ?? '';
const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

/** Fichero de dist que Cloudflare serviría para una ruta limpia (build.format: 'file'). */
function fileFor(pathname: string): string {
  if (pathname === '/') return join(DIST, 'index.html');
  return existsSync(join(DIST, pathname)) && statSync(join(DIST, pathname)).isFile()
    ? join(DIST, pathname)
    : join(DIST, `${pathname}.html`);
}

describe('adv P10 · sitemap y robots resuelven a ficheros reales', () => {
  it('robots.txt apunta a un sitemap que existe en dist, del dominio de producción', () => {
    const line = read(join(DIST, 'robots.txt')).split('\n').find((l) => /^sitemap:/i.test(l))!;
    const u = new URL(line.replace(/^sitemap:\s*/i, '').trim());
    expect(u.origin).toBe('https://nandogomez.com');
    expect(existsSync(join(DIST, u.pathname))).toBe(true);
  });

  it('cada <loc> del índice existe en dist', () => {
    for (const l of locs(read(join(DIST, 'sitemap-index.xml')))) {
      const u = new URL(l);
      expect(u.origin).toBe('https://nandogomez.com');
      expect(existsSync(join(DIST, u.pathname)), l).toBe(true);
    }
  });

  it('cada URL del sitemap se sirve con una página que declara esa misma canonical', () => {
    const urls = locs(read(join(DIST, 'sitemap-0.xml')));
    expect(urls.length).toBeGreaterThan(0);
    for (const l of urls) {
      const u = new URL(l);
      expect(u.search + u.hash).toBe('');
      expect(u.pathname === '/' || !u.pathname.endsWith('/')).toBe(true);
      const f = fileFor(u.pathname);
      expect(existsSync(f), l).toBe(true);
      const html = read(f);
      expect(html).toContain(`<link rel="canonical" href="${l}">`);
      expect(html).not.toMatch(/name="robots"[^>]*noindex/i);
    }
  });

  it('toda página con canonical está en el sitemap (nada indexable se queda fuera)', () => {
    const urls = new Set(locs(read(join(DIST, 'sitemap-0.xml'))));
    for (const p of all) {
      const c = p.doc.querySelector('link[rel=canonical]')?.getAttribute('href');
      if (c) expect(urls.has(c), `${p.name}: ${c}`).toBe(true);
    }
  });

  it('el sitemap es XML con el espacio de nombres estándar', () => {
    const xml = read(join(DIST, 'sitemap-0.xml'));
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});

describe('adv P10 · Open Graph', () => {
  it('og:title y og:description no vacíos ni con plantilla, y únicos entre páginas', () => {
    const t = all.map((p) => meta(p.doc, 'meta[property="og:title"]'));
    const d = all.map((p) => meta(p.doc, 'meta[property="og:description"]'));
    for (const v of [...t, ...d]) {
      expect(v.trim().length).toBeGreaterThan(10);
      expect(v).not.toMatch(/undefined|null|\{\{|\[object/);
    }
    expect(new Set(t).size).toBe(t.length);
    expect(new Set(d).size).toBe(d.length);
  });

  it('og:url es absoluta https al dominio y solo existe en páginas indexables', () => {
    for (const p of indexable) expect(meta(p.doc, 'meta[property="og:url"]')).toMatch(/^https:\/\/nandogomez\.com\//);
  });

  it('cada página declara cada meta OG/Twitter una sola vez', () => {
    for (const p of all)
      for (const sel of ['og:title', 'og:description', 'og:image', 'og:url', 'og:locale', 'og:type'])
        expect(p.doc.querySelectorAll(`meta[property="${sel}"]`).length, `${p.name} ${sel}`).toBeLessThanOrEqual(1);
  });

  it('og:image: un solo fichero, webp de 800 px de ancho (§8 P10) y ≤ 120 KB (A11)', () => {
    const imgs = new Set(all.map((p) => meta(p.doc, 'meta[property="og:image"]')));
    expect(imgs.size).toBe(1);
    const file = join(DIST, new URL([...imgs][0]!).pathname);
    const b = readFileSync(file);
    expect(b.subarray(0, 4).toString()).toBe('RIFF');
    expect(b.subarray(8, 12).toString()).toBe('WEBP');
    const chunk = b.subarray(12, 16).toString();
    let w = 0;
    let h = 0;
    if (chunk === 'VP8X') {
      w = 1 + b.readUIntLE(24, 3);
      h = 1 + b.readUIntLE(27, 3);
    } else if (chunk === 'VP8 ') {
      w = b.readUInt16LE(26) & 0x3fff;
      h = b.readUInt16LE(28) & 0x3fff;
    } else {
      const bits = b.readUInt32LE(21);
      w = (bits & 0x3fff) + 1;
      h = ((bits >> 14) & 0x3fff) + 1;
    }
    expect(w).toBe(800);
    expect(h).toBeGreaterThan(0);
    expect(b.length).toBeLessThanOrEqual(120 * 1024);
  });

  it('el favicon enlazado existe y es el SVG de public', () => {
    for (const p of all) {
      const href = p.doc.querySelector('link[rel~=icon]')?.getAttribute('href') ?? '';
      expect(existsSync(join(DIST, href))).toBe(true);
    }
    expect(read(join(DIST, 'favicon.svg'))).toBe(read(join(import.meta.dirname, '../../public/favicon.svg')));
  });
});

// CSP leída de dist/_headers (la que desplegará Cloudflare).
const headers = read(join(DIST, '_headers'));
const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)![1]!;
const dirs = new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k!, v] as const));
function allowed(directive: string, ref: string): boolean {
  const u = new URL(ref, 'https://nandogomez.com/');
  const srcs = dirs.get(directive) ?? dirs.get('default-src')!;
  return srcs.some((s) => {
    if (s === "'self'") return u.origin === 'https://nandogomez.com';
    const m = /^https:\/\/(\*\.)?([^/]+)$/.exec(s);
    return !!m && u.protocol === 'https:' && (m[1] ? u.hostname.endsWith(`.${m[2]}`) : u.hostname === m[2]);
  });
}

describe('adv P10 · todo lo que referencia dist cabe en la CSP', () => {
  it('HTML: scripts, hojas, imágenes (src y srcset), iconos y preloads', () => {
    for (const { doc, name } of all) {
      const check = (dir: string, ref: string | null): void => {
        if (ref) expect(allowed(dir, ref), `${name}: ${dir} ${ref}`).toBe(true);
      };
      doc.querySelectorAll('script[src]').forEach((e) => check('script-src', e.getAttribute('src')));
      doc.querySelectorAll('link[rel~=stylesheet]').forEach((e) => check('style-src', e.getAttribute('href')));
      doc.querySelectorAll('link[rel~=icon]').forEach((e) => check('img-src', e.getAttribute('href')));
      doc.querySelectorAll('link[rel~=preload][as=font]').forEach((e) => check('font-src', e.getAttribute('href')));
      doc.querySelectorAll('img[src]').forEach((e) => check('img-src', e.getAttribute('src')));
      doc.querySelectorAll('[srcset]').forEach((e) =>
        e.getAttribute('srcset')!.split(',').forEach((c) => check('img-src', c.trim().split(/\s+/)[0]!)),
      );
      // form-action 'none': no hay formularios que enviar.
      expect(doc.querySelectorAll('form').length, name).toBe(0);
      // base-uri 'self': ningún <base> externo.
      doc.querySelectorAll('base[href]').forEach((e) => check('base-uri', e.getAttribute('href')));
      // frame-src cae a default-src 'self'.
      doc.querySelectorAll('iframe[src], object, embed').forEach((e) => check('frame-src', e.getAttribute('src') ?? e.getAttribute('data')));
    }
  });

  it('CSS: url() de fuentes e imágenes son del mismo origen (sin data:, que img-src/font-src no permiten)', () => {
    for (const f of distFiles().filter((x) => x.endsWith('.css'))) {
      for (const m of read(f).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
        const ref = m[1]!;
        const dir = /\.(woff2?|ttf|otf)(\?|#|$)/.test(ref) ? 'font-src' : 'img-src';
        expect(allowed(dir, ref), `${relative(DIST, f)}: ${ref}`).toBe(true);
      }
      expect(read(f)).not.toMatch(/@import\s+(url\()?['"]?https?:/);
    }
  });

  it('JS: los únicos orígenes absolutos son de googletagmanager y caben en script-src', () => {
    for (const f of distFiles().filter((x) => x.endsWith('.js'))) {
      const js = read(f);
      for (const m of js.matchAll(/https?:\/\/[A-Za-z0-9.-]+/g)) {
        expect(allowed('script-src', `${m[0]}/`), `${relative(DIST, f)}: ${m[0]}`).toBe(true);
      }
      // style-src sin unsafe-inline: atributos style escritos por JS serían bloqueados.
      expect(js).not.toMatch(/setAttribute\(\s*[`'"]style[`'"]|innerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
    }
  });
});

// A3b · canonical = og:url = <loc> del sitemap; la 404 queda fuera. Más OG/Twitter, theme-color y favicon.
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '../../src/lib/site';
import { DIST, pages, read } from './helpers';

const all = pages().map((p) => ({ ...p, name: relative(DIST, p.file) }));
const indexable = all.filter((p) => p.name !== '404.html');
const meta = (d: Document, sel: string): string | null | undefined => d.querySelector(sel)?.getAttribute('content');
const URLS = ['https://nandogomez.com/', 'https://nandogomez.com/aviso-legal', 'https://nandogomez.com/cookies', 'https://nandogomez.com/privacidad'];
const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

describe('dist · SEO (P10)', () => {
  const index = read(join(DIST, 'sitemap-index.xml'));
  const sitemapFile = locs(index).find((l) => l.endsWith('sitemap-0.xml'));
  const sitemap = locs(read(join(DIST, 'sitemap-0.xml')));

  it('sitemap-index apunta a sitemap-0.xml del dominio', () => {
    expect(sitemapFile).toBe('https://nandogomez.com/sitemap-0.xml');
  });

  it('A3b · el sitemap tiene las 4 URLs exactas, sin .html ni barra final, y no la 404', () => {
    expect([...sitemap].sort()).toEqual([...URLS].sort());
    expect(sitemap.some((u) => /404|\.html|index/.test(u))).toBe(false);
  });

  it('A3b · canonical, og:url y <loc> coinciden 1:1', () => {
    const canon = indexable.map((p) => p.doc.querySelector('link[rel=canonical]')?.getAttribute('href'));
    const og = indexable.map((p) => meta(p.doc, 'meta[property="og:url"]'));
    expect(canon).toEqual(og);
    expect([...canon].sort()).toEqual([...sitemap].sort());
  });

  it('A3b · la 404 no tiene canonical ni og:url', () => {
    const nf = all.find((p) => p.name === '404.html')!;
    expect(nf.doc.querySelector('link[rel=canonical]')).toBeNull();
    expect(nf.doc.querySelector('meta[property="og:url"]')).toBeNull();
  });

  describe.each(all)('$name', ({ doc }) => {
    it('Open Graph, Twitter, theme-color y favicon', () => {
      expect(meta(doc, 'meta[property="og:title"]')).toBe(doc.title);
      expect(meta(doc, 'meta[property="og:description"]')).toBe(meta(doc, 'meta[name=description]'));
      expect(meta(doc, 'meta[property="og:locale"]')).toBe('es_ES');
      expect(meta(doc, 'meta[property="og:type"]')).toBe('website');
      expect(meta(doc, 'meta[name="twitter:card"]')).toBe('summary');
      expect(meta(doc, 'meta[name="theme-color"]')).toBe(THEME_COLOR);
      expect(doc.querySelector('link[rel=icon]')?.getAttribute('href')).toBe('/favicon.svg');
    });

    it('og:image es absoluta, propia y existe en dist', () => {
      const img = meta(doc, 'meta[property="og:image"]')!;
      expect(img).toMatch(/^https:\/\/nandogomez\.com\/_astro\/[^?#]+\.(webp|jpg|png)$/);
      expect(existsSync(join(DIST, new URL(img).pathname))).toBe(true);
      expect(meta(doc, 'meta[name="twitter:image"]')).toBe(img);
    });
  });

  it('robots.txt y favicon.svg llegan a dist', () => {
    expect(read(join(DIST, 'robots.txt'))).toContain('Sitemap: https://nandogomez.com/sitemap-index.xml');
    expect(existsSync(join(DIST, 'favicon.svg'))).toBe(true);
    expect(existsSync(join(DIST, '_headers'))).toBe(true);
  });

  it('A16 · ninguna página rompe la CSP: nada en línea y sin hosts fuera de self', () => {
    // A5 prohíbe script/style/on* en línea; aquí se comprueba que los recursos son del mismo origen.
    for (const { doc, name } of all) {
      const urls = [...doc.querySelectorAll('[src],link[href]')].map((e) => e.getAttribute('src') ?? e.getAttribute('href') ?? '');
      for (const u of urls.filter((x) => /^(https?:)?\/\//.test(x) && !/^https:\/\/nandogomez\.com\//.test(x))) {
        throw new Error(`${name}: recurso externo ${u}`);
      }
      expect(doc.querySelectorAll('script:not([src]), style, [style]')).toHaveLength(0);
    }
  });
});

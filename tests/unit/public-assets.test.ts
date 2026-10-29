// P10 · robots.txt, favicon.svg y sitemap en la configuración.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const tokens = JSON.parse(read('design/tokens.json')) as { color: { tokens: { name: string; value: string }[] } };
const token = (n: string): string => tokens.color.tokens.find((t) => t.name === n)!.value.toLowerCase();

describe('P10 · robots.txt', () => {
  it('permite todo y apunta al índice del sitemap', () => {
    const lines = read('public/robots.txt').split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines).toEqual(['User-agent: *', 'Allow: /', 'Sitemap: https://nandogomez.com/sitemap-index.xml']);
  });
});

describe('P10 · favicon.svg', () => {
  const svg = read('public/favicon.svg');
  it('es un SVG con el monograma NG', () => {
    expect(svg).toMatch(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/>NG</);
  });
  // Excepción como THEME_COLOR (A10): un favicon es un fichero aparte y no puede leer las variables CSS de la página.
  it('sus colores literales son tokens del sistema', () => {
    const hex = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(hex.length).toBeGreaterThan(0);
    const allowed = [token('bg'), token('border-strong'), token('lime')];
    for (const h of hex) expect(allowed).toContain(h);
  });
});

describe('P10 · integración de sitemap', () => {
  it('astro.config.mjs la incluye y package.json fija la versión exacta', () => {
    expect(read('astro.config.mjs')).toMatch(/sitemap\(/);
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@astrojs/sitemap']).toBe('3.7.4');
  });
});

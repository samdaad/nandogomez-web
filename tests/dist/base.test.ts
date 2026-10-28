import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { DIST, distFiles, pages, read } from './helpers';

const all = pages().map((p) => ({ ...p, file: `/dist/${relative(DIST, p.file)}` }));
const css = distFiles().filter((f) => f.endsWith('.css'));
const EXTERNAL = /fonts\.googleapis\.com|fonts\.gstatic\.com|\/_blob\/|support\.js|DCLogic|data-props|\{\{|x-dc/;

describe('dist · base (P1)', () => {
  it('hay al menos una página y existe dist/index.html', () => {
    expect(all.map((p) => p.file)).toContain('/dist/index.html');
  });

  describe.each(all)('$file', ({ html, doc }) => {
    it('lang="es" y un solo h1', () => {
      expect(doc.documentElement.getAttribute('lang')).toBe('es');
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
    });

    it('A4 · sin restos de diseño ni fuentes externas', () => {
      expect(html).not.toMatch(EXTERNAL);
    });

    it('A5 · nada en línea', () => {
      expect(doc.querySelectorAll('script:not([src]), style, [style]')).toHaveLength(0);
      const on = [...doc.querySelectorAll('*')].filter((e) => e.getAttributeNames().some((n) => n.startsWith('on')));
      expect(on).toHaveLength(0);
    });

    it('A6 · sin referencias a Google Analytics', () => {
      expect(html).not.toMatch(/googletagmanager\.com|google-analytics\.com/);
    });
  });

  it('la home tiene canonical https://nandogomez.com/ exacto', () => {
    const home = all.find((p) => p.file === '/dist/index.html');
    expect(home?.doc.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://nandogomez.com/');
  });

  it('la home enlaza una hoja de estilos y tiene theme-color', () => {
    const home = all.find((p) => p.file === '/dist/index.html');
    expect(home?.doc.querySelector('link[rel=stylesheet]')).not.toBeNull();
    expect(home?.doc.querySelector('meta[name=theme-color]')?.getAttribute('content')).toBe('#0e0f11');
  });

  describe('A9 · fuentes propias', () => {
    it('A4 · los CSS no tienen restos ni URLs externas', () => {
      expect(css.length).toBeGreaterThan(0);
      for (const f of css) expect(read(f)).not.toMatch(EXTERNAL);
    });

    it('hay @font-face con url(/_astro/….woff2) y ninguna URL externa', () => {
      const faces = css.flatMap((f) => read(f).match(/@font-face\s*\{[^}]*\}/g) ?? []);
      expect(faces.length).toBeGreaterThanOrEqual(1);
      for (const face of faces) {
        expect(face).toMatch(/url\(\/_astro\/[^)]+\.woff2\)/);
        expect(face).not.toMatch(/https?:\/\//);
      }
    });

    it('no hay ficheros .woff en dist', () => {
      expect(distFiles().filter((f) => f.endsWith('.woff'))).toEqual([]);
    });
  });
});

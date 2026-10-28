// Tests del adversario para P3, ronda 2 (arreglos de c2670aa). Regresión: no se modifican ni se borran.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { DIST, pages } from './helpers';
import { brokenLinks, fileFor } from './links';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const ids = new Map(all.map((p) => [p.file, new Set([...p.doc.querySelectorAll('[id]')].map((e) => e.id))]));
const idsOf = (f: string): Set<string> => ids.get(f) ?? new Set();
const check = (from: string, body: string): string[] =>
  brokenLinks(from, new JSDOM(`<!DOCTYPE html><body>${body}</body>`).window.document, idsOf);

describe('P3r2 adv · comprobador A7: escapes inválidos y dot-segments codificados', () => {
  it.each([
    ['/%zz'], ['/cookies%zz'], ['/cookies#%zz'], ['#%zz'], ['/cookies#%E2%9C'], ['/%E2%9C'],
    ['/%2e%2e/package.json'], ['/%2E%2E/%2e%2e/docs/PLAN.md'], ['/x/%2e%2e/%2e%2e/package.json'],
    ['/..%5cpackage.json'], ['/%2e%2e%2fpackage.json'],
  ])('%s se reporta como roto (sin lanzar)', (href) => {
    expect(() => check('/privacidad', `<a href="${href}">x</a>`)).not.toThrow();
    expect(check('/privacidad', `<a href="${href}">x</a>`)).toEqual([href]);
  });

  it('un roto no tapa a los demás: se listan todos y los válidos no', () => {
    expect(check('/privacidad', '<a href="/%zz">a</a><a href="/cookies#configurar">b</a><a href="/nada">c</a><a href="#main">d</a>'))
      .toEqual(['/%zz', '/nada']);
  });

  it('fileFor nunca devuelve un fichero fuera de dist/ ni el propio directorio', () => {
    for (const p of ['/..%2fpackage.json', '/x%2f..%2f', '/x%2f..%2f..%2fdist%2fcookies.html', '/%2e%2e%2fdist%2fcookies.html']) {
      const f = fileFor(p);
      if (f) expect(f.startsWith(join(DIST, '/')), p).toBe(true);
    }
    expect(fileFor('/cookies')).toBe(join(DIST, 'cookies.html'));
  });
});

describe('P3r2 adv · espaciado de /cookies como el diseño (24px antes de la tabla, 28px antes del botón)', () => {
  const page = all.find((p) => p.rel === 'cookies.html')!;
  const css = [...page.doc.querySelectorAll('link[rel=stylesheet]')]
    .map((l) => readFileSync(join(DIST, l.getAttribute('href')!), 'utf8')).join('\n');
  const marginOf = (cls: string): string | undefined =>
    css.match(new RegExp(`\\.${cls}\\[[^\\]]+\\]\\{margin-bottom:([^;}]+)`))?.[1]
    ?? css.match(new RegExp(`\\.${cls}\\[[^\\]]+\\][^{]*\\{margin-bottom:([^;}]+)`))?.[1];

  it('el párrafo anterior a la región de la tabla tiene 24px', () => {
    const p = page.doc.querySelector('main [role=region]')!.previousElementSibling!;
    expect(p.tagName).toBe('P');
    const cls = [...p.classList].find((c) => marginOf(c));
    expect(cls && marginOf(cls)).toMatch(/^(24px|var\(--space-6\))$/);
  });

  it('el párrafo anterior al botón «Configurar cookies» tiene 28px (también el de <noscript>)', () => {
    const sec = page.doc.getElementById('configurar')!;
    const ps = [...sec.querySelectorAll(':scope > p, :scope > noscript > p')];
    const last = ps.slice(-2);
    for (const p of last) {
      const cls = [...p.classList].find((c) => marginOf(c));
      expect(cls && marginOf(cls)).toBe('28px');
    }
  });

  it('ya no hay clase .tight fuera de «Última actualización»', () => {
    for (const p of all) {
      p.doc.querySelectorAll('.tight').forEach((e) => expect(e.classList.contains('updated'), p.rel).toBe(true));
    }
  });
});

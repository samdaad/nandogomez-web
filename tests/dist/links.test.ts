import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { DIST, pages } from './helpers';
import { brokenLinks, pageUrlOf } from './links';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const ids = new Map(all.map((p) => [p.file, new Set([...p.doc.querySelectorAll('[id]')].map((e) => e.id))]));
const idsOf = (f: string): Set<string> => ids.get(f) ?? new Set();

describe('A7 · enlaces internos resuelven', () => {
  it.each(all)('$rel', ({ rel, doc }) => {
    expect(brokenLinks(pageUrlOf(rel), doc, idsOf)).toEqual([]);
  });

  it('el comprobador detecta ruta rota, ancla rota y acepta lo válido', () => {
    const d = new JSDOM(
      '<a href="/no-existe">x</a><a href="/cookies#nada">y</a><a href="/cookies#configurar">ok</a><a href="https://a.b/">ext</a><a href="mailto:a@b.c">m</a>',
    ).window.document;
    expect(brokenLinks('/privacidad', d, idsOf)).toEqual(
      expect.arrayContaining(['/no-existe', '/cookies#nada']),
    );
    expect(brokenLinks('/privacidad', d, idsOf)).not.toContain('/cookies#configurar');
  });
});

describe('A3 · las 5 páginas', () => {
  const expected = ['index', 'aviso-legal', 'privacidad', 'cookies', '404'];

  it('existen dist/{index,aviso-legal,privacidad,cookies,404}.html', () => {
    const rels = all.map((p) => p.rel);
    for (const n of expected) expect(rels).toContain(`${n}.html`);
  });

  const five = all.filter((p) => expected.includes(p.rel.replace(/\.html$/, '')));
  it.each(five)('$rel: lang es, un h1', ({ doc }) => {
    expect(doc.documentElement.lang).toBe('es');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('title y meta description únicos y no vacíos', () => {
    const titles = five.map((p) => p.doc.title.trim());
    const descs = five.map((p) => p.doc.querySelector('meta[name=description]')?.getAttribute('content')?.trim() ?? '');
    for (const v of [...titles, ...descs]) expect(v).not.toBe('');
    expect(new Set(titles).size).toBe(five.length);
    expect(new Set(descs).size).toBe(five.length);
  });

  it('404 no tiene canonical ni og:url', () => {
    const d = all.find((p) => p.rel === '404.html')!.doc;
    expect(d.querySelector('link[rel=canonical]')).toBeNull();
    expect(d.querySelector('meta[property="og:url"]')).toBeNull();
  });
});

describe('P3 · margen bajo «Última actualización»', () => {
  const upd = (rel: string) => all.find((p) => p.rel === rel)!.doc.querySelector('main .updated')!;
  it('solo /privacidad (sigue un resumen) usa la variante de 32px', () => {
    expect(upd('privacidad.html').classList.contains('tight')).toBe(true);
    expect(upd('aviso-legal.html').classList.contains('tight')).toBe(false);
    expect(upd('cookies.html').classList.contains('tight')).toBe(false);
  });
});

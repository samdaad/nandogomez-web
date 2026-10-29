import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, distFiles, read, pages } from './helpers';

const home = pages().find((p) => p.file === join(DIST, 'index.html'))!;
const doc = home.doc;
const $ = (s: string): Element | null => doc.querySelector(s);
const text = (e: Element | null | undefined): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('P8 · cabecera', () => {
  const header = $('header')!;
  it('logo NG a #inicio y nav «Principal» con las anclas presentes', () => {
    expect(header.querySelector('a.brand')?.getAttribute('href')).toBe('#inicio');
    expect(text(header.querySelector('.mark'))).toBe('NG');
    const nav = header.querySelector('nav[aria-label="Principal"]')!;
    expect(nav).toBeTruthy();
    const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#servicios');
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
  });

  it('«Contactar» es secundario: nunca lima (§10.2)', () => {
    const a = [...header.querySelectorAll('a')].find((x) => text(x) === 'Contactar')!;
    expect(a).toBeTruthy();
    expect(a.classList.contains('btn--secondary')).toBe(true);
    expect(a.classList.contains('btn--primary')).toBe(false);
  });

  it('como máximo un .btn--primary por header o section', () => {
    for (const c of doc.querySelectorAll('header, section')) {
      expect(c.querySelectorAll('.btn--primary').length, c.id || c.tagName).toBeLessThanOrEqual(1);
    }
  });
});

describe('P8 · #inicio', () => {
  const s = $('section#inicio')!;
  it('h1 con «sin humo.» en un span aparte', () => {
    expect(text(s.querySelector('h1'))).toBe('Ayudo a empresas a entender, elegir y usar la tecnología sin humo.');
    expect(text(s.querySelector('h1 span'))).toBe('sin humo.');
  });
  it('antetítulo y entradilla del diseño', () => {
    expect(text(s)).toContain('CONSULTORÍA · FORMACIÓN · ASESORÍA');
    expect(text(s)).toContain('Soy consultor y formador tecnológico.');
  });
  it('botón principal «Hablemos» (lima) y secundario «Qué hago →» a #servicios', () => {
    const a = s.querySelector('a.btn--primary')!;
    expect(text(a)).toBe('Hablemos');
    expect(['#contacto', 'mailto:hola@nandogomez.com']).toContain(a.getAttribute('href'));
    const b = [...s.querySelectorAll('a.btn--secondary')].find((x) => text(x).startsWith('Qué hago'))!;
    expect(b.getAttribute('href')).toBe('#servicios');
  });
});

describe('P8 · retrato (A11)', () => {
  const pic = $('#inicio figure picture')!;
  const img = pic?.querySelector('img');
  it('<picture> con avif y <img> webp con width, height y alt', () => {
    expect(pic.querySelector('source[type="image/avif"]')).toBeTruthy();
    expect(img?.getAttribute('alt')).toBe('Nando Gómez impartiendo una formación en un escenario');
    expect(Number(img?.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(img?.getAttribute('height'))).toBeGreaterThan(0);
    expect(img?.getAttribute('src')).toMatch(/\.webp$/);
  });
  it('ningún derivado supera 120 KB, ninguno es PNG, y hay hasta 800 px', () => {
    const urls = [...pic.querySelectorAll('[srcset], [src]')]
      .flatMap((e) => (e.getAttribute('srcset') ?? e.getAttribute('src') ?? '').split(',').map((x) => x.trim().split(/\s+/)[0]!))
      .filter(Boolean);
    expect(urls.length).toBeGreaterThanOrEqual(6); // 3 anchos × (avif + webp)
    for (const u of urls) {
      expect(u).not.toMatch(/\.png$/);
      expect(statSync(join(DIST, u)).size, u).toBeLessThan(120 * 1024);
    }
    expect(urls.some((u) => /_800w\.|w=800|800/.test(u))).toBe(true);
  });
  it('doble anillo y pie «Nando Gómez» / «Consultor y formador»', () => {
    expect($('#inicio figure .ring')).toBeTruthy();
    const cap = $('#inicio figure figcaption')!;
    expect([...cap.querySelectorAll('span')].map(text)).toEqual(['Nando Gómez', 'Consultor y formador']);
  });
});

describe('P8 · #servicios', () => {
  const s = $('section#servicios')!;
  it('etiqueta «/ servicios» como h2 y 3 article con h3, svg decorativo y texto', () => {
    expect(text(s.querySelector('h2'))).toBe('/ servicios');
    const cards = [...s.querySelectorAll('article')];
    expect(cards.map((c) => text(c.querySelector('h3')))).toEqual(['Consultoría tecnológica', 'Formación', 'Asesoría a empresas']);
    for (const c of cards) {
      expect(c.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(text(c.querySelector('p')).length).toBeGreaterThan(80);
    }
  });
});

describe('P8 · movimiento y 320 px (§5)', () => {
  const css = distFiles().filter((f) => f.endsWith('.css')).map(read).join('\n');
  it('scroll-behavior: smooth solo bajo prefers-reduced-motion: no-preference', () => {
    const all = css.match(/scroll-behavior\s*:\s*smooth/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    const guarded = css.match(/@media\s*\(prefers-reduced-motion\s*:\s*no-preference\)\s*\{[^{}]*\{[^{}]*scroll-behavior\s*:\s*smooth/g) ?? [];
    expect(guarded.length).toBe(all.length);
  });
  it('h1 con overflow-wrap: anywhere y clamp() en su tamaño', () => {
    const rule = /\{[^{}]*clamp\(48px[^{}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });
});

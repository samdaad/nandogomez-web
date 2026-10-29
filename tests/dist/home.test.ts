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
    const widths = [...pic.querySelectorAll('[srcset]')].flatMap((e) => [...(e.getAttribute('srcset') ?? '').matchAll(/\s(\d+)w/g)].map((m) => Number(m[1])));
    expect(Math.max(...widths)).toBe(800);
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

const TWOFERS_URL = 'https://twofers.es';
const LINKEDIN_URL = 'https://www.linkedin.com/in/nandogomez/';
const external = (root: ParentNode): Element[] => [...root.querySelectorAll('a[href^="http"]')];

describe('P9 · estructura y nav', () => {
  it('main contiene, en orden, las 7 secciones de la home', () => {
    expect([...doc.querySelectorAll('main > section')].map((s) => s.id)).toEqual(['inicio', 'servicios', 'metodo', 'sobre-mi', 'clientes', 'twofers', 'contacto']);
  });
  it('la nav enlaza las 4 anclas del diseño y «Contactar» y «Hablemos» van a #contacto', () => {
    const hrefs = [...$('header nav')!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#servicios', '#metodo', '#sobre-mi', '#twofers', '#contacto']);
    expect($('#inicio a.btn--primary')?.getAttribute('href')).toBe('#contacto');
  });
});

describe('P9 · #metodo', () => {
  const s = $('section#metodo')!;
  it('h2 con la parte atenuada en un span', () => {
    expect(text(s.querySelector('h2'))).toBe('Primero entiendo cómo trabajas. La tecnología viene después.');
    expect(text(s.querySelector('h2 span'))).toBe('La tecnología viene después.');
  });
  it('4 pasos en una lista ordenada, con número mono', () => {
    const items = [...s.querySelectorAll('ol > li')];
    expect(items.map((li) => text(li.querySelector('.num')))).toEqual(['01 — Escuchar', '02 — Diagnosticar', '03 — Implantar', '04 — Formar']);
    for (const li of items) expect(text(li.querySelector('p:not(.num)')).length).toBeGreaterThan(50);
  });
});

describe('P9 · #sobre-mi', () => {
  const s = $('section#sobre-mi')!;
  it('etiqueta, frase destacada, trayectoria y filas Formación / Dirección', () => {
    expect(text(s.querySelector('h2'))).toBe('/ sobre mí');
    expect(text(s)).toContain('Explicar bien la tecnología es tan importante como construirla.');
    expect(text(s)).toContain('Durante más de 26 años dirigí el departamento de Tecnologías de la Información');
    expect(text(s)).toContain('Trabajo desde Barcelona con empresas de toda España.');
    expect([...s.querySelectorAll('dt')].map(text)).toEqual(['Formación', 'Dirección']);
    expect(text(s.querySelectorAll('dd')[1])).toBe('Programa Superior en Administración y Dirección de Empresas (PDAE) · EAE Business School');
  });
});

describe('P9 · franja de clientes', () => {
  const s = $('section#clientes')!;
  const order = [...doc.querySelectorAll('main > section')].map((x) => x.id);
  it('va entre #sobre-mi y #twofers, con título y SectionLabel', () => {
    expect(order.indexOf('clientes')).toBe(order.indexOf('sobre-mi') + 1);
    expect(text(s.querySelector('h2'))).toBe('Empresas con las que he trabajado');
    expect(text(s.querySelector('.label'))).toBe('/ han confiado en mí');
  });
  it('lista semántica con exactamente los 6 nombres, solo texto y sin enlaces', () => {
    expect([...s.querySelectorAll('ul > li')].map(text)).toEqual(['Deor Consultores', 'OK Humedades', 'Learn2Be', 'Vil·la Minerva', 'Miquel Pares', 'RG Compact']);
    expect(s.querySelectorAll('li')).toHaveLength(6);
    expect(s.querySelector('a, img, svg')).toBeNull();
    expect(text(s.querySelectorAll('li')[3])).toContain('\u00B7');
  });
});

describe('P9 · #twofers', () => {
  const s = $('section#twofers')!;
  it('bloque Digital Twofers sin la frase de clientes', () => {
    expect(text(s.querySelector('h2'))).toBe('Digital Twofers');
    expect(text(s)).toContain('Cuando hay que construir, lo hacemos en Digital Twofers, mi empresa');
    expect(text(s)).not.toMatch(/producción|OK Humedades|RG Compact|DEOR/i);
  });
  it('enlace a twofers.es, seguro y con flecha decorativa', () => {
    const a = s.querySelector('a')!;
    expect(a.getAttribute('href')).toBe(TWOFERS_URL);
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(a)).toBe('twofers.es ↗');
  });
});

describe('P9 · #contacto', () => {
  const s = $('section#contacto')!;
  it('h2, entradilla del diseño y sin cifras', () => {
    expect(text(s.querySelector('h2'))).toBe('Cuéntame qué quieres resolver.');
    expect(text(s)).toContain('Te respondo yo, personalmente.');
    expect(text(s)).not.toMatch(/\d/);
  });
  it('«Escríbeme» lima a mailto y LinkedIn secundario seguro', () => {
    const w = s.querySelector('a.btn--primary')!;
    expect(text(w)).toBe('Escríbeme');
    expect(w.getAttribute('href')).toBe('mailto:hola@nandogomez.com');
    const l = [...s.querySelectorAll('a.btn--secondary')].find((a) => text(a).startsWith('LinkedIn'))!;
    expect(l.getAttribute('href')).toBe(LINKEDIN_URL);
    expect(l.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(l)).toBe('LinkedIn ↗');
  });
});

describe('P9 · enlaces externos y accesibilidad', () => {
  it('los únicos destinos externos de la home son twofers.es y LinkedIn', () => {
    expect(external(doc).map((a) => a.getAttribute('href')).sort()).toEqual([LINKEDIN_URL, TWOFERS_URL].sort());
    for (const a of external(doc)) expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('●, → y ↗ decorativos van en un elemento aria-hidden', () => {
    const marks = [...doc.querySelectorAll('main *')].filter((e) => e.children.length === 0 && /^[●→↗]$/.test(text(e)));
    expect(marks.map(text).sort()).toEqual(['→', '↗', '↗', '●']);
    for (const m of marks) expect(m.getAttribute('aria-hidden'), m.outerHTML).toBe('true');
  });
  it('un solo .btn--primary por sección y por cabecera', () => {
    for (const c of doc.querySelectorAll('header, section')) expect(c.querySelectorAll('.btn--primary').length).toBeLessThanOrEqual(1);
  });
});

describe('P9 · retrato y :hover (notas del adversario de P8)', () => {
  it('sizes refleja el CSS real: ~280 px junto al texto (≥1012 px) y min(380px, 100vw − 70px) debajo', () => {
    const img = $('#inicio picture img')!;
    expect(img.getAttribute('sizes')).toBe('(min-width: 1012px) 280px, min(380px, calc(100vw - 70px))');
    expect($('#inicio picture source')!.getAttribute('sizes')).toBe(img.getAttribute('sizes'));
  });
  const css = distFiles().filter((f) => f.endsWith('.css')).map(read).join('\n');
  const hover = [...css.matchAll(/([^{}]+:hover[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!, body: m[2]! }));
  it('botón secundario y enlaces de la nav tienen :hover con tokens', () => {
    const sec = hover.find((r) => /btn--secondary/.test(r.sel));
    const nav = hover.find((r) => /nav/.test(r.sel) && /\ba\b|>a|> a/.test(r.sel));
    expect(sec?.body).toMatch(/border-color:var\(--ink-muted\)/);
    expect(nav?.body).toMatch(/color:var\(--ink\)/);
    for (const r of hover) expect(r.body, r.sel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

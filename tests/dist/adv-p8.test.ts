// Adversario P8: home I (cabecera, hero, retrato, servicios) contra design/Tecnico.dc.html y §2/§5/§10.2.
// No asume listas cerradas: P9 añadirá secciones, anclas y botones; los tests comparan con lo que exista.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { NAV, SECTIONS } from '../../src/lib/home';
import { EMAIL } from '../../src/lib/site';
import { DIST, distFiles, read } from './helpers';

const doc = new JSDOM(read(join(DIST, 'index.html'))).window.document;
const design = new JSDOM(readFileSync(join(import.meta.dirname, '../../design/Tecnico.dc.html'), 'utf8')).window.document;
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const text = (e: Element | null | undefined): string => norm(e?.textContent);
const ids = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));

describe('adv P8 · fidelidad de textos frente al diseño', () => {
  it('#inicio: antetítulo, h1, entradilla, botones y pie idénticos al diseño (salvo «Hablemos»)', () => {
    const pick = (d: Document): string[] => {
      const s = d.querySelector('#inicio')!;
      return [...s.querySelectorAll('p, h1, a, figcaption span')].map(text);
    };
    expect(pick(doc)).toEqual(pick(design).map((t) => (t === 'Agenda una llamada' ? 'Hablemos' : t)));
  });

  it('h1: «sin humo.» es el único fragmento atenuado y cierra el titular', () => {
    const h1 = doc.querySelector('#inicio h1')!;
    expect(text(h1)).toBe(text(design.querySelector('#inicio h1')));
    expect(h1.querySelectorAll('span')).toHaveLength(1);
    expect(text(h1.lastElementChild)).toBe('sin humo.');
  });

  it('#servicios: etiqueta y las 3 tarjetas (título y texto) idénticas al diseño', () => {
    const d = [...design.querySelectorAll('#servicios article')].map((a) => [text(a.querySelector('h3')), text(a.querySelector('p'))]);
    const got = [...doc.querySelectorAll('#servicios article')].map((a) => [text(a.querySelector('h3')), text(a.querySelector('p'))]);
    expect(got).toEqual(d);
    expect(text(doc.querySelector('#servicios h2'))).toBe(text(design.querySelector('#servicios > p')));
  });

  it('nav: etiquetas y destinos del diseño, en su orden, filtrados a las anclas que existen', () => {
    const dnav = [...design.querySelectorAll('header nav a')].map((a) => ({ href: a.getAttribute('href')!, label: text(a) }));
    // El diseño es la fuente de NAV: mismas 4 anclas, mismas etiquetas, mismo orden (sin «Contactar»).
    expect(dnav.filter((n) => n.label !== 'Contactar').map((n) => ({ id: n.href.slice(1), label: n.label }))).toEqual(NAV.map((n) => ({ ...n })));
    const links = [...doc.querySelectorAll('header nav a')].map((a) => ({ href: a.getAttribute('href')!, label: text(a) }));
    const expected = dnav.filter((n) => n.label !== 'Contactar' && ids.has(n.href.slice(1)));
    expect(links.slice(0, -1)).toEqual(expected);
    expect(links.at(-1)!.label).toBe('Contactar');
  });
});

describe('adv P8 · §10.2: un solo botón lima en cabecera + hero', () => {
  it('exactamente un .btn--primary entre header y #inicio, y es «Hablemos»', () => {
    const prim = [...doc.querySelectorAll('header .btn--primary, #inicio .btn--primary')];
    expect(prim.map(text)).toEqual(['Hablemos']);
  });
  it('«Contactar» es .btn--secondary.btn--sm (borde fuerte, radio sm)', () => {
    const c = [...doc.querySelectorAll('header a')].find((a) => text(a) === 'Contactar')!;
    expect([...c.classList]).toEqual(expect.arrayContaining(['btn', 'btn--secondary', 'btn--sm']));
  });
});

describe('adv P8 · retrato (A5, A11, rendimiento)', () => {
  const pic = doc.querySelector('#inicio picture')!;
  const img = pic.querySelector('img')!;
  const avif = pic.querySelector('source[type="image/avif"]')!;
  const widths = (e: Element): number[] => [...(e.getAttribute('srcset') ?? '').matchAll(/\s(\d+)w/g)].map((m) => Number(m[1]));
  const urls = [...pic.querySelectorAll('[srcset], [src]')].flatMap((e) =>
    [e.getAttribute('src') ?? '', ...(e.getAttribute('srcset') ?? '').split(',').map((x) => x.trim().split(/\s+/)[0]!)].filter(Boolean),
  );

  it('srcset avif y webp con los mismos anchos y el mismo sizes', () => {
    expect(widths(avif)).toEqual([360, 560, 800]);
    expect(widths(img)).toEqual(widths(avif));
    expect(avif.getAttribute('sizes')).toBe(img.getAttribute('sizes'));
    expect(img.getAttribute('sizes')).toBeTruthy();
  });

  it('width/height cuadrados (CSS fuerza 1:1) para no provocar CLS', () => {
    expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
    expect(img.getAttribute('width')).toBe(img.getAttribute('height'));
  });

  it('above-the-fold: no lazy, fetchpriority=high', () => {
    expect(img.getAttribute('loading')).not.toBe('lazy');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('alt exacto del diseño', () => {
    expect(img.getAttribute('alt')).toBe(design.querySelector('#inicio figure img')!.getAttribute('alt'));
  });

  it('todo sale de /_astro/ (img-src self, nada de /_blob/ ni hosts externos)', () => {
    expect(urls.length).toBeGreaterThanOrEqual(7);
    for (const u of urls) expect(u, u).toMatch(/^\/_astro\/[^/]+\.(avif|webp)$/);
  });

  it('ninguna imagen de dist (derivados y src por defecto) supera 120 KB ni es PNG', () => {
    const imgs = distFiles().filter((f) => /\.(png|jpe?g|webp|avif|gif)$/i.test(f));
    expect(imgs.length).toBeGreaterThanOrEqual(7);
    for (const f of imgs) {
      expect(f).not.toMatch(/\.png$/i);
      expect(statSync(f).size, f).toBeLessThan(120 * 1024);
    }
  });
});

describe('adv P8 · accesibilidad estructural', () => {
  it('landmarks: header con nav nombrada y un único main', () => {
    expect(doc.querySelectorAll('main')).toHaveLength(1);
    const nav = doc.querySelector('header nav')!;
    expect(norm(nav.getAttribute('aria-label'))).not.toBe('');
  });

  it('un solo h1, dentro de main', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('main h1')).toBeTruthy();
  });

  it('jerarquía de encabezados sin saltos (nunca sube más de un nivel)', () => {
    const levels = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `h${levels[i - 1]} → h${levels[i]}`).toBeLessThanOrEqual(1);
  });

  it('cada h3 de servicios cuelga de un h2 de su sección', () => {
    for (const s of doc.querySelectorAll('main section')) {
      if (s.querySelector('h3')) expect(s.querySelector('h2'), s.id).toBeTruthy();
    }
  });

  it('SVG sin título accesible son decorativos (aria-hidden) y no enfocables', () => {
    for (const svg of doc.querySelectorAll('main svg')) {
      if (!svg.querySelector('title') && !svg.getAttribute('aria-label')) expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).not.toBe('true');
    }
  });

  it('todos los enlaces tienen nombre accesible', () => {
    for (const a of doc.querySelectorAll('a[href]')) {
      const name = norm(a.getAttribute('aria-label')) || text(a);
      expect(name, a.outerHTML).not.toBe('');
    }
  });

  it('ningún tabindex positivo; dentro de main el único tabindex es el -1 de main', () => {
    for (const e of doc.querySelectorAll('[tabindex]')) {
      expect(Number(e.getAttribute('tabindex')), e.outerHTML.slice(0, 80)).toBeLessThanOrEqual(0);
    }
    expect(doc.querySelectorAll('main [tabindex]')).toHaveLength(0);
  });
});

describe('adv P8 · A7: anclas y mailto', () => {
  it('todo #ancla de la home existe, y cada ancla de la nav es una section de main', () => {
    for (const a of doc.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute('href')!.slice(1);
      expect(id, a.outerHTML).not.toBe('');
      expect(ids.has(id), `#${id}`).toBe(true);
    }
    for (const a of doc.querySelectorAll('header nav a[href^="#"]')) {
      expect(doc.querySelector(`main section${a.getAttribute('href')}`), a.getAttribute('href')!).toBeTruthy();
    }
  });

  it('los mailto están bien formados y apuntan al correo del sitio, sin parámetros inyectados', () => {
    const m = [...doc.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')!);
    for (const h of m) {
      expect(h).toBe(`mailto:${EMAIL}`);
      expect(h).toMatch(/^mailto:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i);
    }
  });

  it('«Hablemos» y «Contactar» van al mismo destino, y es #contacto si existe', () => {
    const dest = (label: string): string => [...doc.querySelectorAll('a')].find((a) => text(a) === label)!.getAttribute('href')!;
    expect(dest('Hablemos')).toBe(dest('Contactar'));
    expect(dest('Hablemos')).toBe(ids.has('contacto') ? '#contacto' : `mailto:${EMAIL}`);
  });

  it('SECTIONS (home.ts) coincide con las section[id] reales de main: P9 no puede desincronizarlos', () => {
    const real = [...doc.querySelectorAll('main > section[id]')].map((s) => s.id).sort();
    expect([...SECTIONS].sort()).toEqual(real);
  });
});

describe('adv P8 · CSS: 320 px y movimiento reducido (§5)', () => {
  const css = distFiles().filter((f) => f.endsWith('.css')).map(read).join('\n');
  // Solo reglas de componentes que pinta la home (por su data-astro-cid) o globales sin cid.
  const cids = new Set([...read(join(DIST, 'index.html')).matchAll(/data-astro-cid-([a-z0-9]+)/g)].map((m) => m[1]!));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1]!.trim(), body: m[2]! }))
    .filter((r) => [...r.sel.matchAll(/data-astro-cid-([a-z0-9]+)/g)].every((m) => cids.has(m[1]!)));

  it('ningún width/min-width fijo > 320 px en declaraciones', () => {
    for (const r of rules) {
      for (const m of r.body.matchAll(/(?:^|;)\s*(min-width|width)\s*:\s*(\d+(?:\.\d+)?)px/g)) {
        expect(Number(m[2]), `${r.sel} { ${m[1]}: ${m[2]}px }`).toBeLessThanOrEqual(320);
      }
    }
  });

  it('todo flex-basis > 320 px va acompañado de min-width: 0 (si no, desborda a 320 px)', () => {
    // Lightning CSS minifica `flex: 1 1 320px` a `flex:320px` y `999 1 600px` a `999 600px`.
    let checked = 0;
    for (const r of rules) {
      const m = /(?:^|;)\s*flex\s*:\s*(?:[\d.]+\s+){0,2}(\d+)px/.exec(r.body);
      if (m && Number(m[1]) >= 272) {
        checked++;
        expect(r.body, r.sel).toMatch(/min-width\s*:\s*0(?![.\d])/);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3); // figure, article, .copy
  });

  it('transition/animation y scroll-behavior: smooth solo dentro de prefers-reduced-motion: no-preference', () => {
    const outside = css.replace(/@media\s*\(prefers-reduced-motion\s*:\s*no-preference\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(outside).not.toMatch(/scroll-behavior\s*:\s*smooth/);
    expect(outside).not.toMatch(/(?:^|[;{])\s*(transition|animation)(?:-[a-z-]+)?\s*:/);
  });
});

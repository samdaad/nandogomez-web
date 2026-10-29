// Adversario P9: home II (#metodo, #sobre-mi, #clientes, #twofers, #contacto) contra design/Tecnico.dc.html,
// §2, §5, §7, §10.2 y las decisiones del orquestador (franja de clientes cerrada, sin cifras de resultados).
// La lista de clientes SÍ es cerrada; el resto de listas se comparan con lo que exista.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { SECTIONS, navFor } from '../../src/lib/home';
import { EMAIL } from '../../src/lib/site';
import { DIST, distFiles, pages, read, walk } from './helpers';

const ROOT = join(import.meta.dirname, '../..');
const doc = new JSDOM(read(join(DIST, 'index.html'))).window.document;
const design = new JSDOM(readFileSync(join(ROOT, 'design/Tecnico.dc.html'), 'utf8')).window.document;
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const text = (e: Element | null | undefined): string => norm(e?.textContent);
const $ = (s: string): Element => doc.querySelector(s)!;

/** Texto visible: sin script/style/noscript/template. */
const visible = (d: Document | Element): string => {
  const c = ('body' in d ? d.body : d).cloneNode(true) as Element;
  c.querySelectorAll('script, style, noscript, template').forEach((e) => e.remove());
  return norm(c.textContent);
};

const css = distFiles().filter((f) => f.endsWith('.css')).map(read).join('\n');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
const tokens = new Set([...read(join(ROOT, 'src/styles/tokens.css')).matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]!));

const CLIENTS = ['DEOR Consultores', 'OK Humedades', 'Learn2Be', 'Vil·la Minerva', 'Miquel Pares', 'RG Compact'];

describe('adv P9 · fidelidad de textos frente al diseño', () => {
  it('#metodo: etiqueta, titular y los 4 pasos (número y texto) idénticos al diseño', () => {
    const pick = (d: Document): string[] => [...d.querySelectorAll('#metodo p, #metodo h2')].map(text);
    expect(pick(doc)).toEqual(pick(design));
    expect(text($('#metodo h2 span'))).toBe(text(design.querySelector('#metodo h2 span')));
  });

  it('#sobre-mi: etiqueta, frase, trayectoria, cierre y filas dt/dd idénticos al diseño', () => {
    const pick = (d: Document): string[] => [...d.querySelectorAll('#sobre-mi p, #sobre-mi h2, #sobre-mi dt, #sobre-mi dd')].map(text);
    const ours = pick(doc);
    const theirs = pick(design);
    // El diseño tiene la etiqueta como <p>; aquí es <h2> (primer elemento en ambos casos).
    expect(ours.sort()).toEqual(theirs.sort());
  });

  it('#sobre-mi: datos de trayectoria y formación literales', () => {
    const t = visible($('#sobre-mi'));
    expect(t).toContain('Durante más de 26 años dirigí');
    expect(t).toContain('Escuela Universitaria de Hostelería y Turismo de Sant Pol de Mar');
    expect(t).toContain('Desde 2016 soy consultor y formador en tecnología, comunicación e informática con DEOR Consultores');
    expect(t).toContain('después de haberlo sido también con Grup Qualia.');
    expect(t).toContain('Ingeniero Técnico en Informática de Gestión · Escuela Universitaria Politécnica de Mataró');
    expect(t).toContain('Programa Superior en Administración y Dirección de Empresas (PDAE) · EAE Business School');
  });

  it('#twofers: etiqueta y título del diseño; el párrafo es la 1.ª frase del diseño, sin la de clientes', () => {
    expect(text($('#twofers .label'))).toBe(text(design.querySelector('#twofers p')));
    expect(text($('#twofers h2'))).toBe(text(design.querySelector('#twofers h2')));
    const dp = text(design.querySelectorAll('#twofers p')[1]);
    const first = dp.slice(0, dp.indexOf('.') + 1);
    expect(first).toMatch(/^Cuando hay que construir/);
    const ps = [...doc.querySelectorAll('#twofers p')].map(text);
    expect(ps).toEqual([text(design.querySelector('#twofers p')), first]);
  });

  it('#contacto: titular, entradilla y textos de botón idénticos al diseño (sin el pie, que es el Footer común)', () => {
    const pick = (d: Document): string[] => [...d.querySelectorAll('#contacto h2, #contacto > div p, #contacto > div a')].map(text);
    expect(pick(doc)).toEqual(pick(design));
  });
});

describe('adv P9 · clientes (lista cerrada)', () => {
  it('franja propia entre #sobre-mi y #twofers con exactamente los 6 nombres, en el orden de la decisión', () => {
    const ids = [...doc.querySelectorAll('main > section')].map((s) => s.id);
    expect(ids.slice(ids.indexOf('sobre-mi'), ids.indexOf('sobre-mi') + 3)).toEqual(['sobre-mi', 'clientes', 'twofers']);
    expect(text($('#clientes h2'))).toBe('Empresas con las que he trabajado');
    const li = [...doc.querySelectorAll('#clientes ul > li')];
    expect(li.map(text)).toEqual(CLIENTS);
    for (const l of li) expect(l.children).toHaveLength(0); // solo texto
  });

  it('Vil·la Minerva usa U+00B7 (no U+2027, U+22C5 ni U+2219) en el HTML de dist', () => {
    const html = read(join(DIST, 'index.html'));
    expect(html).toContain('Vil·la Minerva');
    expect(html).not.toMatch(/Vil[‧⋅∙.\-]la/);
  });

  it('ningún nombre de cliente fuera de #clientes, salvo DEOR (y Grup Qualia) en la trayectoria de #sobre-mi', () => {
    for (const { file, doc: d } of pages()) {
      const c = d.body.cloneNode(true) as Element;
      c.querySelector('#clientes')?.remove();
      const about = c.querySelector('#sobre-mi');
      const aboutText = about ? visible(about) : '';
      about?.remove();
      const rest = visible(c);
      for (const n of [...CLIENTS, 'DEOR', 'Deor', 'Humedades', 'Learn2Be', 'Minerva', 'Pares', 'RG Compact', 'Qualia']) {
        expect(rest, `${file}: «${n}» fuera de #clientes/#sobre-mi`).not.toContain(n);
      }
      if (about) {
        for (const n of ['OK Humedades', 'Learn2Be', 'Minerva', 'Pares', 'RG Compact']) expect(aboutText).not.toContain(n);
        expect(aboutText.match(/Qualia/g)).toHaveLength(1);
        expect(aboutText).toContain('Grup Qualia');
      }
    }
  });

  it('ningún nombre de cliente en <head> ni en atributos (alt, title, aria-label, content) de ninguna página', () => {
    for (const { file, doc: d } of pages()) {
      const attrs = [...d.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.value)).join(' | ');
      for (const n of ['Deor', 'DEOR', 'Humedades', 'Learn2Be', 'Minerva', 'Pares', 'RG Compact', 'Qualia']) {
        expect(attrs, `${file}: «${n}» en un atributo`).not.toContain(n);
        expect(norm(d.head.textContent), `${file}: «${n}» en <head>`).not.toContain(n);
      }
    }
  });

  it('ningún otro cliente conocido de Nando aparece en ningún fichero de dist ni de src', () => {
    const deny = /Frutas Domingo|Be-?Food|Bemarse|Miki|Simone|Inglan|Match Pr[aá]cticas|Mapfre|Carrefour|megecutz|Kodarvia|Retlaw|AdmiFinca|ComuNexo|Unplanned|Serendip|campusvirtualsocial|Minreva/i;
    const files = [...distFiles(), ...walk(join(ROOT, 'src'))].filter((f) => /\.(html|css|js|astro|ts|json)$/.test(f));
    for (const f of files) expect(read(f), f).not.toMatch(deny);
  });

  it('sin enlaces a webs de clientes ni imágenes externas: el único <img> de la home es el retrato local', () => {
    expect(doc.querySelectorAll('#clientes a, #clientes img, #clientes svg, #clientes picture')).toHaveLength(0);
    const imgs = [...doc.querySelectorAll('img')];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.closest('#inicio picture')).toBeTruthy();
    for (const e of doc.querySelectorAll('[src], [srcset]')) {
      for (const v of [e.getAttribute('src'), e.getAttribute('srcset')]) if (v) expect(v, e.outerHTML).not.toMatch(/https?:\/\//);
    }
  });
});

describe('adv P9 · sin cifras de resultados en ninguna página', () => {
  const RESULT = [
    /\d+(?:[.,]\d+)?\s?%/, // 92 %, 40%
    /[×✕]\s?\d/, // ×2,4
    /\bx\s?\d+(?:[.,]\d+)?\b/i, // x3
    /[−–]\s?\d/, // −92 %
    /\+\s?\d+/, // +40 clientes
    /\d+\s+(?:clientes|proyectos|empresas|alumnos|horas ahorradas|veces)\b/i,
  ];
  it('el texto visible de la home no tiene porcentajes, multiplicadores ni «+N clientes» («más de 26 años» aprobado)', () => {
    const t = visible(doc);
    for (const re of RESULT) expect(t.match(re)?.[0] ?? null, String(re)).toBeNull();
    expect(t).toContain('más de 26 años');
  });
  it('tampoco en las páginas legales ni en la 404 (salvo teléfono y datos registrales)', () => {
    for (const { file, doc: d } of pages()) {
      const t = visible(d).replace(/\+34[\d\s]+/g, '');
      for (const re of RESULT) expect(t.match(re)?.[0] ?? null, `${file} ${re}`).toBeNull();
    }
  });
});

describe('adv P9 · nav, anclas y contacto', () => {
  it('SECTIONS (src/lib/home) ≡ section[id] reales de main, en orden', () => {
    expect([...doc.querySelectorAll('main > section[id]')].map((s) => s.id)).toEqual([...SECTIONS]);
    expect(doc.querySelectorAll('main section')).toHaveLength(SECTIONS.length);
  });
  it('nav con 4 anclas que resuelven; Hablemos y Contactar → #contacto', () => {
    const nav = $('header nav[aria-label="Principal"]');
    const anchors = [...nav.querySelectorAll('a:not(.btn)')];
    expect(anchors).toHaveLength(4);
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual(navFor(SECTIONS).map((n) => `#${n.id}`));
    for (const a of anchors) expect(doc.getElementById(a.getAttribute('href')!.slice(1)), a.outerHTML).toBeTruthy();
    const byText = (t: string): Element[] => [...doc.querySelectorAll('a')].filter((a) => text(a) === t);
    expect(byText('Hablemos').map((a) => a.getAttribute('href'))).toEqual(['#contacto']);
    expect(byText('Contactar').map((a) => a.getAttribute('href'))).toEqual(['#contacto']);
  });
  it('mailto exacto, LinkedIn exacto y twofers.es exacto', () => {
    expect([...doc.querySelectorAll('#contacto a[href^="mailto:"]')].map((a) => a.getAttribute('href'))).toEqual([`mailto:${EMAIL}`]);
    expect(EMAIL).toBe('hola@nandogomez.com');
    expect([...doc.querySelectorAll('#contacto a[href^="http"]')].map((a) => a.getAttribute('href'))).toEqual(['https://www.linkedin.com/in/nandogomez/']);
    expect([...doc.querySelectorAll('#twofers a')].map((a) => a.getAttribute('href'))).toEqual(['https://twofers.es']);
  });
  it('externos de la home: solo https, sin target (§7) o, si lo hubiera, con rel noopener noreferrer', () => {
    const ext = [...doc.querySelectorAll('a[href]')].filter((a) => /^[a-z]+:/i.test(a.getAttribute('href')!));
    expect(ext.map((a) => a.getAttribute('href')!.split(':')[0]).every((p) => p === 'https' || p === 'mailto')).toBe(true);
    for (const a of ext) {
      const t = a.getAttribute('target');
      if (t) {
        const rel = (a.getAttribute('rel') ?? '').split(/\s+/);
        expect(rel).toContain('noopener');
        expect(rel).toContain('noreferrer');
      }
      expect(t, a.outerHTML).toBeNull();
    }
  });
});

describe('adv P9 · accesibilidad estática', () => {
  it('un solo h1 y encabezados sin saltos en toda la home (incluido banner/panel)', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    const levels = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `salto ${levels[i - 1]}→${levels[i]}`).toBeLessThanOrEqual(1);
  });
  it('cada sección nueva tiene exactamente un h2', () => {
    for (const id of ['metodo', 'sobre-mi', 'clientes', 'twofers', 'contacto']) expect($(`#${id}`).querySelectorAll('h2'), id).toHaveLength(1);
  });
  it('#metodo es <ol> con 4 <li> directos; #clientes es <ul> con 6 <li> directos; todo <li> tiene padre ul/ol', () => {
    expect($('#metodo ol').querySelectorAll(':scope > li')).toHaveLength(4);
    expect($('#clientes ul').querySelectorAll(':scope > li')).toHaveLength(6);
    for (const li of doc.querySelectorAll('li')) expect(['UL', 'OL']).toContain(li.parentElement!.tagName);
  });
  it('aria-hidden solo en símbolos decorativos (o el monograma NG) y nunca con algo enfocable dentro', () => {
    for (const e of doc.querySelectorAll('[aria-hidden="true"]')) {
      if (e.tagName === 'svg' || e.closest('svg')) continue;
      const t = text(e);
      expect(t === 'NG' || !/\p{L}/u.test(t), e.outerHTML).toBe(true);
      expect(e.matches('a,button,input,[tabindex]') || e.querySelector('a,button,input,[tabindex]'), e.outerHTML).toBeFalsy();
    }
  });
  it('los enlaces con flecha conservan nombre accesible con letras fuera del aria-hidden', () => {
    for (const a of doc.querySelectorAll('a')) {
      const c = a.cloneNode(true) as Element;
      c.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
      expect(text(c), a.outerHTML).toMatch(/\p{L}/u);
    }
  });

  it('foco visible: existe :focus-visible con outline y nada salvo main:focus lo anula', () => {
    expect(rules.some((r) => /:focus-visible/.test(r.sel) && /outline:2px solid var\(--ink\)/.test(r.body.replace(/\s+/g, ' ').replace(/: /g, ':')))).toBe(true);
    for (const r of rules.filter((r) => /outline:\s*(none|0)\b/.test(r.body))) expect(r.sel, r.sel).toMatch(/^main:focus$/);
  });
  it(':hover solo con tokens existentes (sin hex, rgb ni var() inventadas)', () => {
    const hov = rules.filter((r) => /:hover/.test(r.sel));
    expect(hov.length).toBeGreaterThan(0);
    for (const r of hov) {
      expect(r.body, r.sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      for (const m of r.body.matchAll(/var\(--([\w-]+)\)/g)) expect(tokens.has(m[1]!), `${r.sel}: --${m[1]}`).toBe(true);
    }
  });
});

describe('adv P9 · §10.2 un solo botón lima visible a la vez', () => {
  it('la home tiene exactamente 2 .btn--primary: «Hablemos» en #inicio y «Escríbeme» en #contacto; la cabecera ninguno', () => {
    const prim = [...doc.querySelectorAll('.btn--primary')];
    expect(prim.map((b) => [b.closest('section')?.id, text(b)])).toEqual([['inicio', 'Hablemos'], ['contacto', 'Escríbeme']]);
    expect(doc.querySelectorAll('header .btn--primary')).toHaveLength(0);
    expect($('header nav .btn').classList.contains('btn--secondary')).toBe(true);
  });
  it('#inicio y #contacto están separados por al menos 3 secciones de altura completa', () => {
    const ids = [...doc.querySelectorAll('main > section')].map((s) => s.id);
    expect(ids.indexOf('contacto') - ids.indexOf('inicio')).toBeGreaterThanOrEqual(4);
  });
  it('fuera de .btn--primary y del panel de cookies, ningún selector pinta fondo lima', () => {
    for (const r of rules.filter((r) => /background(-color)?:\s*var\(--lime\)/.test(r.body))) {
      expect(r.sel, r.sel).toMatch(/btn--primary|btn--lime|switch/);
    }
  });
});

describe('adv P9 · sizes del retrato coherente con el CSS', () => {
  const px = (name: string): number => Number(read(join(ROOT, 'src/styles/tokens.css')).match(new RegExp(`--${name}:\\s*(\\d+)px`))![1]);
  const page = read(join(ROOT, 'src/pages/index.astro'));
  const portrait = read(join(ROOT, 'src/components/Portrait.astro'));
  const num = (src: string, re: RegExp): number => Number(src.match(re)![1]);

  it('el corte del media query = 2·gutter + base .copy + base figure + gap de columna', () => {
    const gutter = px('space-6');
    const copyBasis = num(page, /\.copy\s*\{[^}]*flex:\s*\d+\s+\d+\s+(\d+)px/);
    const figBasis = num(portrait, /figure\s*\{[^}]*flex:\s*\d+\s+\d+\s+(\d+)px/);
    const colGap = num(page, /#inicio\s*\{[^}]*gap:\s*\d+px\s+(\d+)px/);
    const bp = 2 * gutter + copyBasis + figBasis + colGap;
    const sizes = doc.querySelector('#inicio picture img')!.getAttribute('sizes')!;
    const m = sizes.match(/^\(min-width:\s*(\d+)px\)\s*(\d+)px,\s*min\((\d+)px,\s*calc\(100vw\s*-\s*(\d+)px\)\)$/);
    expect(m, sizes).toBeTruthy();
    const [, bpS, wide, cap, sub] = m!.map(Number);
    expect(bpS).toBe(bp);
    const ring = 2 * (num(portrait, /\.ring\s*\{[^}]*padding:\s*(\d+)px/) + px('hairline'));
    const maxFig = num(portrait, /figure\s*\{[^}]*max-width:\s*(\d+)px/);
    // En fila, figure ≈ su base (flex-grow 1 frente a 999): img = base − anillo.
    expect(Math.abs(wide! - (figBasis - ring))).toBeLessThanOrEqual(4);
    // En columna: img = min(max-width, 100vw − 2·gutter) − anillo.
    expect(Math.abs(cap! - (maxFig - ring))).toBeLessThanOrEqual(4);
    expect(sub).toBe(2 * gutter + ring);
    expect(doc.querySelector('#inicio picture source')!.getAttribute('sizes')).toBe(sizes);
  });
});

describe('adv P9 · 320 px en las secciones nuevas (§5)', () => {
  const files = ['src/pages/index.astro', 'src/components/MethodStep.astro', 'src/components/DefinitionRows.astro', 'src/components/Button.astro', 'src/components/SectionLabel.astro'];
  const styleRules = files.flatMap((f) => {
    const s = read(join(ROOT, f));
    const st = s.slice(s.indexOf('<style>'));
    return [...st.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ f, sel: m[1]!.trim(), body: m[2]! }));
  });
  it('sin width/min-width fijos > 320 px', () => {
    for (const r of styleRules) {
      for (const m of r.body.matchAll(/(?:^|;|\s)(min-width|width)\s*:\s*(\d+)px/g)) expect(Number(m[2]), `${r.f} ${r.sel}`).toBeLessThanOrEqual(320);
    }
  });
  it('toda base flex > 272 px (320 − 2·24) va con min-width: 0', () => {
    for (const r of styleRules) {
      const m = r.body.match(/flex:\s*\d+\s+\d+\s+(\d+)px/);
      if (m && Number(m[1]) > 272) expect(r.body, `${r.f} ${r.sel}`).toMatch(/min-width:\s*0/);
    }
  });
  it('titulares con clamp(≥ 32px) llevan overflow-wrap: anywhere', () => {
    for (const r of styleRules) {
      const m = r.body.match(/font-size:\s*clamp\((\d+)px/);
      if (m && Number(m[1]) >= 32) expect(r.body, `${r.f} ${r.sel}`).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });
});


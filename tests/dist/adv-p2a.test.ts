// Tests del adversario para P2a (componentes legales, /aviso-legal, pie único A8). Regresión:
// no se modifican ni se borran. Cubren docs/PLAN.md §2 (A3b, A4–A6, A8), §3 (Footer único,
// «Configurar cookies» = <a href="/cookies#configurar" data-consent-open>), §5 (Teclado) y P2a.
// No asumen listas cerradas: P2b–P11 añadirán páginas, cabecera de home, banner y panel.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { DIST, pages } from './helpers';

const ROOT = join(import.meta.dirname, '../..');
const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const aviso = all.find((p) => p.rel === 'aviso-legal.html');
const design = new JSDOM(readFileSync(join(ROOT, 'design/AvisoLegal.dc.html'), 'utf8')).window.document;

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const digits = (s: string): string => s.replace(/\D/g, '');

describe('P2a adv · fidelidad de /aviso-legal frente a design/AvisoLegal.dc.html', () => {
  it('existe y el texto completo de <main> coincide con el del diseño (sin añadir ni quitar nada)', () => {
    expect(aviso).toBeDefined();
    // Astro compacta el espacio entre bloques; se compara sin espacios en blanco.
    const flat = (d: Document) => (d.querySelector('main')?.textContent ?? '').replace(/\s+/g, '');
    expect(flat(aviso!.doc)).toBe(flat(design));
  });

  it('los h2 son los 7 del diseño, en el mismo orden', () => {
    const want = [...design.querySelectorAll('main h2')].map((h) => norm(h.textContent));
    expect(want).toHaveLength(7);
    expect([...aviso!.doc.querySelectorAll('main h2')].map((h) => norm(h.textContent))).toEqual(want);
  });

  it('los pares dt/dd son exactamente los del diseño (titular, NIF, domicilio, contacto)', () => {
    const pairs = (d: Document) =>
      [...d.querySelectorAll('main dt')].map((dt) => [norm(dt.textContent), norm(dt.nextElementSibling?.textContent)]);
    expect(pairs(aviso!.doc)).toEqual(pairs(design));
    const map = Object.fromEntries(pairs(aviso!.doc));
    // Decisión de Nando (29/10/2026): el titular es la persona física; la sociedad solo factura.
    expect(map['Titular']).toBe('Fernando Gómez Margiotta');
    expect(map['Nombre comercial']).toBe('Nando Gómez');
    expect(map['NIF']).toBe('45496623R');
    expect(map['Domicilio']).toBe('Moratín 31-33, 08302 Mataró (Barcelona), España');
    expect(map['Correo electrónico']).toBe('hola@nandogomez.com');
    expect(map['Teléfono']).toBe('+34 603 24 26 82');
  });

  it('no hay fila de Registro Mercantil y la fecha es un pendiente explícito', () => {
    // Decisión de Nando (29/10/2026): el aviso legal no publica los datos del Registro Mercantil.
    const d = aviso!.doc;
    const dts = [...d.querySelectorAll('main dt')].map((dt) => norm(dt.textContent));
    expect(dts.some((t) => /registro|mercantil/i.test(t))).toBe(false);
    expect(aviso!.html).not.toMatch(/Registro\s+Mercantil/i);
    const upd = norm(d.querySelector('main .updated')?.textContent ?? '');
    expect(upd).toMatch(/^Última actualización: \[[^\]]+\]$/);
    // Ninguna fecha ni dato registral con cifras colado en el texto de main.
    const text = norm(d.querySelector('main')?.textContent);
    expect(text).not.toMatch(/\b(tomo|folio|hoja|inscripción)\s*\d/i);
    expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  });

  it('el apartado 6 enlaza a /privacidad y /cookies con los textos del diseño', () => {
    const links = [...aviso!.doc.querySelectorAll('main a')].map((a) => [a.getAttribute('href'), norm(a.textContent)]);
    expect(links).toContainEqual(['/privacidad', 'política de privacidad']);
    expect(links).toContainEqual(['/cookies', 'política de cookies']);
  });

  it('el apartado 7 mantiene legislación española y jurisdicción del consumidor', () => {
    const h7 = [...aviso!.doc.querySelectorAll('main h2')].find((h) => norm(h.textContent).startsWith('7. '));
    const p = norm(h7?.nextElementSibling?.textContent);
    expect(p).toContain('legislación española');
    expect(p).toContain('domicilio del usuario');
    expect(p).toContain('consumidor');
  });

  it('mailto y tel apuntan exactamente al valor mostrado', () => {
    const d = aviso!.doc;
    const mail = d.querySelector('main a[href^="mailto:"]')!;
    expect(mail.getAttribute('href')).toBe(`mailto:${norm(mail.textContent)}`);
    const tel = d.querySelector('main a[href^="tel:"]')!;
    expect(tel.getAttribute('href')).toMatch(/^tel:\+\d+$/);
    expect(digits(tel.getAttribute('href')!)).toBe(digits(norm(tel.textContent)));
  });

  it('no hay restos del prototipo: sin .dc.html, sin enlaces a Tecnico, sin URLs externas en main', () => {
    expect(aviso!.html).not.toMatch(/\.dc\.html|Tecnico/);
    for (const a of aviso!.doc.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href')!;
      expect(h, h).toMatch(/^(\/|#|mailto:|tel:)/);
    }
  });
});

describe('P2a adv · estructura y accesibilidad de /aviso-legal', () => {
  it('dl: 6 <div> como hijos (sin Registro Mercantil), cada uno con exactamente un dt seguido de un dd', () => {
    const dl = aviso!.doc.querySelector('main dl')!;
    for (const child of dl.children) {
      expect(child.tagName).toBe('DIV');
      expect([...child.children].map((c) => c.tagName)).toEqual(['DT', 'DD']);
    }
    expect(dl.children).toHaveLength(6);
    expect([...dl.querySelectorAll('dt')].map((dt) => norm(dt.textContent))).toEqual([
      'Titular', 'Nombre comercial', 'NIF', 'Domicilio', 'Correo electrónico', 'Teléfono',
    ]);
    expect([...dl.querySelectorAll('dt')].map((dt) => norm(dt.textContent))).toEqual(
      [...design.querySelectorAll('main dl dt')].map((dt) => norm(dt.textContent)),
    );
  });

  it('cabecera (banner) y pie (contentinfo) están fuera de main y a nivel de body', () => {
    const d = aviso!.doc;
    expect(d.querySelectorAll('main')).toHaveLength(1);
    expect(d.querySelectorAll('body > header')).toHaveLength(1);
    expect(d.querySelector('main header, main footer')).toBeNull();
  });

  it('el título de la pestaña y la descripción existen y no están vacíos', () => {
    const d = aviso!.doc;
    expect(norm(d.title)).toBe('Aviso legal — Nando Gómez');
    expect(norm(d.querySelector('meta[name=description]')?.getAttribute('content')).length).toBeGreaterThan(20);
  });

  it('el enlace de marca tiene nombre accesible legible (la marca NG va aria-hidden)', () => {
    const brand = aviso!.doc.querySelector('body > header a[href="/"]')!;
    const clone = brand.cloneNode(true) as Element;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    expect(norm(clone.textContent)).toBe('Nando Gómez');
  });
});

describe.each(all)('P2a adv · todas las páginas: $rel', ({ doc, html }) => {
  it('jerarquía de encabezados sin saltos y empezando por un único h1', () => {
    const levels = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    levels.forEach((l, i) => {
      if (i > 0) expect(l - levels[i - 1]!, `salto h${levels[i - 1]} → h${l}`).toBeLessThanOrEqual(1);
    });
  });

  it('skip link: primer elemento enfocable del body, apunta a #main, y #main es <main tabindex="-1">', () => {
    const first = doc.querySelector('body a[href], body button, body input, body select, body textarea, body [tabindex]:not([tabindex="-1"])');
    expect(first?.getAttribute('href')).toBe('#main');
    const target = doc.getElementById('main');
    expect(target?.tagName).toBe('MAIN');
    expect(target?.getAttribute('tabindex')).toBe('-1');
    expect(doc.querySelectorAll('[id="main"]')).toHaveLength(1);
  });

  it('un solo pie, a nivel de body, fuera de main y al final', () => {
    expect(doc.querySelectorAll('footer')).toHaveLength(1);
    expect(doc.querySelector('body > footer')).not.toBeNull();
    expect(doc.querySelector('main footer')).toBeNull();
    expect(doc.querySelector('main ~ footer')).not.toBeNull();
  });

  it('A8 · «Configurar cookies» es un <a> (funciona sin JS) a /cookies#configurar, único y dentro del pie', () => {
    const triggers = doc.querySelectorAll('footer [data-consent-open]');
    expect(triggers).toHaveLength(1);
    const t = triggers[0]!;
    expect(t.tagName).toBe('A');
    expect(t.getAttribute('href')).toBe('/cookies#configurar');
    expect(norm(t.textContent)).toBe('Configurar cookies');
    expect(t.hasAttribute('target')).toBe(false);
  });

  it('toda <nav> tiene nombre accesible y los nombres no se repiten', () => {
    const names = [...doc.querySelectorAll('nav')].map((n) => norm(n.getAttribute('aria-label') ?? n.getAttribute('aria-labelledby')));
    names.forEach((n) => expect(n.length).toBeGreaterThan(0));
    expect(new Set(names).size).toBe(names.length);
  });

  it('enlaces internos en forma canónica: sin .html, sin index y sin barra final', () => {
    for (const a of doc.querySelectorAll('a[href^="/"]')) {
      const path = a.getAttribute('href')!.replace(/[?#].*$/, '');
      expect(path, path).not.toMatch(/\.html$|\/index$|.\/$|^\/\//);
    }
  });

  it('A4–A6 · nada en línea ni externo en esta página (refuerzo por página)', () => {
    expect(html).not.toMatch(/<style[\s>]|\sstyle=|\son[a-z]+=|fonts\.g(oogleapis|static)\.com|googletagmanager|google-analytics|x-dc|data-props|DCLogic/i);
    for (const s of doc.querySelectorAll('script')) expect(s.hasAttribute('src')).toBe(true);
    for (const l of doc.querySelectorAll('link[href]')) expect(l.getAttribute('href')).not.toMatch(/^(https?:)?\/\/(?!nandogomez\.com)/);
  });
});

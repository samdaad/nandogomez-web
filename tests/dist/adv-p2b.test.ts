// Tests del adversario para P2b (/privacidad). Regresión: no se modifican ni se borran.
// Cubren docs/PLAN.md §2 (A3, A3b, A5, A8), §5 (Teclado), §7 (enlaces externos), §10.1 y P2b,
// comparando con design/Privacidad.dc.html. No asumen listas cerradas de páginas.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { DIST, distFiles, pages, read } from './helpers';

const ROOT = join(import.meta.dirname, '../..');
const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const priv = all.find((p) => p.rel === 'privacidad.html');
const aviso = all.find((p) => p.rel === 'aviso-legal.html');
const design = new JSDOM(readFileSync(join(ROOT, 'design/Privacidad.dc.html'), 'utf8')).window.document;
const plan = readFileSync(join(ROOT, 'docs/PLAN.md'), 'utf8');

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const flat = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '');
const S101 = plan.match(/\*Privacidad, bloque B, «Conservación»:\*\s*«([^»]+)»/)?.[1];

describe('P2b adv · fidelidad de /privacidad frente al diseño y §10.1', () => {
  it('§10.1 se encuentra en el plan', () => {
    expect(S101).toBeDefined();
    expect(S101).toMatch(/^Hemos configurado Google Analytics/);
  });

  it('el texto completo de <main> es el del diseño, salvo «Conservación» de B, que es §10.1 literal', () => {
    expect(priv).toBeDefined();
    const d = design.cloneNode(true) as Document;
    const ddB = [...d.querySelectorAll('main dl')][1]!.querySelectorAll('dd')[3]!;
    expect(norm(ddB.textContent)).toMatch(/^14 meses en Google Analytics/);
    ddB.textContent = S101!;
    expect(flat(priv!.doc.querySelector('main')?.textContent)).toBe(flat(d.querySelector('main')?.textContent));
  });

  it('las 8 filas dt/dd coinciden con el diseño una a una (B·Conservación = §10.1 exacto)', () => {
    const pairs = (doc: Document) =>
      [...doc.querySelectorAll('main dl')].map((dl) =>
        [...dl.querySelectorAll('dt')].map((dt) => [norm(dt.textContent), norm(dt.nextElementSibling?.textContent)]),
      );
    const want = pairs(design);
    want[1]![3]![1] = S101!;
    expect(pairs(priv!.doc)).toEqual(want);
  });

  it('las etiquetas de bloque, h1 y h2 son las del diseño, en orden', () => {
    const lab = (doc: Document) =>
      [...doc.querySelectorAll('main p')].map((p) => norm(p.textContent)).filter((t) => /^[AB] — /.test(t));
    expect(lab(priv!.doc)).toEqual(['A — Consultas y contacto', 'B — Analítica de la web']);
    const hs = (doc: Document) => [...doc.querySelectorAll('main h1, main h2')].map((h) => `${h.tagName}:${norm(h.textContent)}`);
    expect(hs(priv!.doc)).toEqual(hs(design));
  });

  it('responsable: Digital Twofers, S.L., NIF, domicilio, correo y sin DPO', () => {
    const h = [...priv!.doc.querySelectorAll('main h2')].find((x) => norm(x.textContent).startsWith('1. '))!;
    const p = h.nextElementSibling!;
    const t = norm(p.textContent);
    expect(t).toContain('Digital Twofers, S.L. (NIF B16988479)');
    expect(t).toContain('La Riera 31, 08302 Mataró (Barcelona)');
    expect(t).toContain('No tenemos designado delegado de protección de datos.');
    expect(p.querySelector('a')?.getAttribute('href')).toBe('mailto:hola@nandogomez.com');
    expect(norm(p.querySelector('a')?.textContent)).toBe('hola@nandogomez.com');
  });

  it('encargados, transferencias, derechos con AEPD y menores de 14', () => {
    const t = norm(priv!.doc.querySelector('main')?.textContent);
    const li = [...priv!.doc.querySelectorAll('main ul > li')].map((l) => norm(l.querySelector('strong')?.textContent));
    expect(li).toEqual(['Cloudflare, Inc.', 'Google']);
    expect(t).toContain('EU-US Data Privacy Framework');
    expect(t).toContain('cláusulas contractuales tipo aprobadas por la Comisión');
    expect(t).toContain('menores de 14 años');
    const aepd = priv!.doc.querySelector('main a[href="https://www.aepd.es"]');
    expect(norm(aepd?.textContent)).toBe('www.aepd.es');
  });

  it('el enlace de «Conservación» de B va a /cookies con el texto «política de cookies»', () => {
    const dd = [...priv!.doc.querySelectorAll('main dl')][1]!.querySelectorAll('dd')[3]!;
    const a = dd.querySelectorAll('a');
    expect(a).toHaveLength(1);
    expect(a[0]!.getAttribute('href')).toBe('/cookies');
    expect(norm(a[0]!.textContent)).toBe('política de cookies');
  });
});

describe('P2b adv · seguridad del HTML inyectado y A5', () => {
  it('los enlaces de <main> son internos, mailto: o https, y nunca .dc.html', () => {
    for (const a of priv!.doc.querySelectorAll('main a')) {
      const h = a.getAttribute('href') ?? '';
      expect(h).toMatch(/^(\/(?!\/)|mailto:|https:\/\/)/);
      expect(h).not.toMatch(/\.dc\.html|javascript:/i);
    }
  });

  it('el contenido de los dd de los bloques solo tiene <a href> sin atributos extra', () => {
    for (const el of priv!.doc.querySelectorAll('main section dd *')) {
      expect(el.tagName).toBe('A');
      const attrs = el.getAttributeNames().filter((n) => !n.startsWith('data-astro-cid-'));
      expect(attrs).toEqual(['href']);
    }
  });

  it('A5 en /privacidad: sin style=, on*=, <style> ni <script> en línea', () => {
    const d = priv!.doc;
    expect(d.querySelectorAll('style')).toHaveLength(0);
    for (const s of d.querySelectorAll('script')) expect(s.getAttribute('src')).toBeTruthy();
    for (const el of d.querySelectorAll('*')) {
      for (const n of el.getAttributeNames()) {
        expect(n).not.toBe('style');
        expect(n).not.toMatch(/^on/);
      }
    }
  });

  it('enlaces con target=_blank (si los hay) llevan rel noopener', () => {
    for (const a of priv!.doc.querySelectorAll('a[target]')) {
      if (a.getAttribute('target') === '_blank') expect(a.getAttribute('rel') ?? '').toMatch(/\bnoopener\b/);
    }
  });
});

describe('P2b adv · estructura y a11y de /privacidad', () => {
  it('un h1 y sin saltos de nivel de encabezado en todo el documento', () => {
    const d = priv!.doc;
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    let prev = 0;
    for (const h of d.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const lvl = Number(h.tagName[1]);
      expect(lvl - prev).toBeLessThanOrEqual(1);
      prev = lvl;
    }
  });

  it('cada fila es div > dt + dd (exactamente uno de cada) y los bloques son <section>', () => {
    for (const dl of priv!.doc.querySelectorAll('dl')) {
      for (const child of dl.children) {
        expect(child.tagName).toBe('DIV');
        expect([...child.children].map((c) => c.tagName)).toEqual(['DT', 'DD']);
      }
      expect(dl.closest('section')).not.toBeNull();
    }
  });

  it('title y description únicos entre las páginas generadas', () => {
    const t = all.map((p) => p.doc.title);
    const desc = all.map((p) => p.doc.querySelector('meta[name=description]')?.getAttribute('content'));
    expect(new Set(t).size).toBe(t.length);
    expect(new Set(desc).size).toBe(desc.length);
  });
});

describe('P2b adv · la variante card no altera /aviso-legal y main:focus es lo único sin contorno', () => {
  it('/aviso-legal sigue con un único dl de 6 filas div > dt + dd, sin clase card', () => {
    const dls = aviso!.doc.querySelectorAll('main dl');
    expect(dls).toHaveLength(1);
    expect(dls[0]!.classList.contains('card')).toBe(false);
    expect(dls[0]!.children).toHaveLength(6);
    for (const c of dls[0]!.children) expect([...c.children].map((x) => x.tagName)).toEqual(['DT', 'DD']);
  });

  const css = distFiles().filter((f) => f.endsWith('.css')).map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

  it('toda regla CSS que menciona .card queda limitada a .card (no se filtra a la variante legal)', () => {
    for (const r of rules.filter((x) => /\.card\b/.test(x.sel))) {
      for (const s of r.sel.split(',')) expect(s).toMatch(/\.card\b/);
    }
  });

  it('en dist, toda regla que anula el contorno tiene selector exactamente main:focus', () => {
    const off = rules.filter((r) => /outline:(none|0|transparent)\b/.test(r.body));
    expect(off.length).toBeGreaterThanOrEqual(1);
    for (const r of off) expect(r.sel).toBe('main:focus');
  });
});

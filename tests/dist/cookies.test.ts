import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { DIST, pages } from './helpers';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const page = all.find((p) => p.rel === 'cookies.html');
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const PARRAFO =
  'La duración indica cuánto permanece cada cookie en tu navegador si no la borras antes. El plazo de conservación de los datos en Google Analytics es otro y se explica en la política de privacidad. Si retiras tu consentimiento, borramos las cookies _ga de tu navegador.';

describe('dist · /cookies (P3)', () => {
  it('existe, con canonical y og:url exactos y lang es', () => {
    expect(page).toBeDefined();
    const d = page!.doc;
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://nandogomez.com/cookies');
    expect(d.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://nandogomez.com/cookies');
    expect(d.documentElement.lang).toBe('es');
    expect(d.querySelector('h1')?.textContent?.trim()).toBe('Política de cookies');
  });

  it('4 h2 numerados, en el orden del diseño', () => {
    const h2 = [...page!.doc.querySelectorAll('main h2')].map((h) => norm(h.textContent));
    expect(h2).toEqual([
      '1. Qué son las cookies',
      '2. Qué cookies usa esta web',
      '3. Cómo aceptar, rechazar o cambiar tu elección',
      '4. Más información',
    ]);
  });

  it('la tabla tiene 3 filas de datos y 5 columnas con scope=col', () => {
    const t = page!.doc.querySelector('main table')!;
    expect(t.querySelectorAll('tbody tr')).toHaveLength(3);
    const th = [...t.querySelectorAll('thead th')];
    expect(th.map((h) => norm(h.textContent))).toEqual(['Cookie', 'Titular', 'Tipo', 'Para qué sirve', 'Duración']);
    th.forEach((h) => expect(h.getAttribute('scope')).toBe('col'));
  });

  it('filas: ng_consent, _ga y _ga_<ID>, con las duraciones aprobadas (§10.1)', () => {
    const rows = [...page!.doc.querySelectorAll('main table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => norm(c.textContent)),
    );
    expect(rows.map((r) => r[0])).toEqual([rows[0]![0], '_ga', rows[2]![0]]);
    expect(rows[0]![0]).toBe('ng_consent');
    expect(rows[2]![0]).toMatch(/^_ga_(\[ID\]|[A-Z0-9]{4,15})$/);
    expect(rows[0]![4]).toBe('12 meses');
    expect(rows[1]![4]).toBe('2 años (en tu navegador)');
    expect(rows[2]![4]).toBe('2 años (en tu navegador)');
    expect(rows[0]![1]).toBe('Propia');
    expect(rows[1]![1]).toBe('Google');
  });

  it('la tabla va en una región con tabindex=0, nombre accesible y desplazable por teclado', () => {
    const region = page!.doc.querySelector('main table')!.closest('[tabindex]')!;
    expect(region).not.toBeNull();
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('role')).toBe('region');
    expect(norm(region.getAttribute('aria-label'))).not.toBe('');
  });

  it('el párrafo tras la tabla es el aprobado en §10.1', () => {
    const region = page!.doc.querySelector('main table')!.closest('[tabindex]')!;
    expect(norm(region.nextElementSibling?.textContent)).toBe(PARRAFO);
  });

  it('#configurar existe, contiene el <noscript> y el botón «Configurar cookies»', () => {
    const d = page!.doc;
    const sec = d.querySelector('main #configurar')!;
    expect(sec).not.toBeNull();
    expect(norm(sec.querySelector('noscript')?.textContent)).not.toBe('');
    const btn = sec.querySelector('a[data-consent-open]')!;
    expect(norm(btn.textContent)).toBe('Configurar cookies');
    expect(btn.getAttribute('href')).toBe('/cookies#configurar');
    expect(norm(sec.querySelector('h2')?.textContent)).toBe('3. Cómo aceptar, rechazar o cambiar tu elección');
  });

  it('enlaces a privacidad, aviso legal y mailto; sin .dc.html', () => {
    const d = page!.doc;
    expect(d.querySelector('main a[href="/privacidad"]')).not.toBeNull();
    expect(d.querySelector('main a[href="/aviso-legal"]')).not.toBeNull();
    expect(d.querySelector('main a[href="mailto:hola@nandogomez.com"]')).not.toBeNull();
    expect(page!.html).not.toMatch(/\.dc\.html/);
  });

  it('fecha pendiente visible y pie con «Configurar cookies» (A8)', () => {
    expect(page!.doc.body.textContent).toContain('[FECHA DE PUBLICACIÓN]');
    expect(page!.doc.querySelector('footer [data-consent-open]')?.getAttribute('href')).toBe('/cookies#configurar');
  });
});

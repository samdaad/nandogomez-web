import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { DIST, pages } from './helpers';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const page = all.find((p) => p.rel === 'privacidad.html');
const CONSERVACION_B =
  'Hemos configurado Google Analytics para conservar los datos asociados a usuarios y eventos durante 14 meses; después dejan de estar disponibles para su análisis detallado. Los informes con cifras agregadas, que no identifican a nadie, pueden mantenerse más tiempo. Este plazo es distinto de la duración de las cookies en tu navegador (hasta 2 años), que se detalla en la política de cookies.';

const rowsOf = (block: Element): Record<string, string> =>
  Object.fromEntries(
    [...block.querySelectorAll('dl > div')].map((r) => [
      r.querySelector('dt')?.textContent?.trim() ?? '',
      r.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    ]),
  );

describe('dist · /privacidad (P2b)', () => {
  it('existe dist/privacidad.html con canonical y og:url exactos', () => {
    expect(page).toBeDefined();
    const d = page!.doc;
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://nandogomez.com/privacidad');
    expect(d.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://nandogomez.com/privacidad');
    expect(d.documentElement.lang).toBe('es');
  });

  it('un h1 y 6 h2 numerados', () => {
    const d = page!.doc;
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    expect(d.querySelector('h1')?.textContent?.trim()).toBe('Política de privacidad');
    const h2 = [...d.querySelectorAll('main h2')].map((h) => h.textContent?.trim());
    expect(h2).toHaveLength(6);
    h2.forEach((t, i) => expect(t).toMatch(new RegExp(`^${i + 1}\\. `)));
  });

  it('bloques A y B con 4 filas cada uno, en orden', () => {
    const blocks = [...page!.doc.querySelectorAll('main section.block')];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.textContent).toContain('A — Consultas y contacto');
    expect(blocks[1]!.textContent).toContain('B — Analítica de la web');
    for (const b of blocks) {
      expect(b.querySelectorAll('dl > div > dt')).toHaveLength(4);
      expect(b.querySelectorAll('dl > div > dd')).toHaveLength(4);
      expect(Object.keys(rowsOf(b))).toEqual(['Datos', 'Finalidad', 'Base legal', 'Conservación']);
    }
  });

  it('«Conservación» de B lleva la redacción aprobada de §10.1 y no «14 meses en Google Analytics»', () => {
    const b = page!.doc.querySelectorAll('main section.block')[1]!;
    const cons = rowsOf(b)['Conservación']!;
    expect(cons).toBe(CONSERVACION_B);
    expect(cons).not.toContain('14 meses en Google Analytics');
  });

  it('«Conservación» de A conserva el texto del diseño', () => {
    const a = page!.doc.querySelectorAll('main section.block')[0]!;
    expect(rowsOf(a)['Conservación']).toMatch(/^Tres años desde el último contacto\./);
  });

  it('enlaces: cookies, mailto, AEPD y sin .dc.html', () => {
    const d = page!.doc;
    expect(d.querySelector('main a[href="/cookies"]')).not.toBeNull();
    expect(d.querySelectorAll('main a[href="mailto:hola@nandogomez.com"]').length).toBeGreaterThanOrEqual(2);
    expect(d.querySelector('main a[href="https://www.aepd.es"]')).not.toBeNull();
    expect(page!.html).not.toMatch(/\.dc\.html/);
  });

  it('resumen, proveedores y fecha pendiente visibles', () => {
    const d = page!.doc;
    const text = d.body.textContent ?? '';
    expect(text).toContain('En resumen: solo tratamos los datos');
    expect(text).toContain('[FECHA DE PUBLICACIÓN]');
    const li = [...d.querySelectorAll('main ul > li')].map((l) => l.textContent ?? '');
    expect(li).toHaveLength(2);
    expect(li[0]).toContain('Cloudflare, Inc.');
    expect(li[1]).toContain('Google');
  });

  it('A8: pie completo y main con tabindex', () => {
    const d = page!.doc;
    const f = d.querySelector('footer')!;
    const link = (t: string) => [...f.querySelectorAll('a')].find((a) => a.textContent?.trim() === t);
    expect(link('Aviso legal')?.getAttribute('href')).toBe('/aviso-legal');
    expect(link('Privacidad')?.getAttribute('href')).toBe('/privacidad');
    expect(link('Cookies')?.getAttribute('href')).toBe('/cookies');
    expect(f.querySelector('[data-consent-open]')?.textContent?.trim()).toBe('Configurar cookies');
    expect(d.querySelector('main#main')?.getAttribute('tabindex')).toBe('-1');
  });
});

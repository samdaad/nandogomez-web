import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { DIST, pages } from './helpers';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const page = all.find((p) => p.rel === 'aviso-legal.html');

const rows = (): Record<string, string> =>
  Object.fromEntries(
    [...page!.doc.querySelectorAll('main dl > div')].map((r) => [
      r.querySelector('dt')?.textContent?.trim() ?? '',
      r.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    ]),
  );

describe('dist · /aviso-legal (P2a)', () => {
  it('existe dist/aviso-legal.html', () => {
    expect(page).toBeDefined();
  });

  it('canonical y og:url exactos', () => {
    const d = page!.doc;
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://nandogomez.com/aviso-legal');
    expect(d.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://nandogomez.com/aviso-legal');
  });

  it('un h1, 7 h2 numerados y 6 pares dt/dd', () => {
    const d = page!.doc;
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    const h2 = [...d.querySelectorAll('main h2')].map((h) => h.textContent?.trim());
    expect(h2).toHaveLength(7);
    h2.forEach((t, i) => expect(t).toMatch(new RegExp(`^${i + 1}\\. `)));
    expect(d.querySelectorAll('main dl > div > dt')).toHaveLength(6);
    expect(d.querySelectorAll('main dl > div > dd')).toHaveLength(6);
  });

  it('teléfono como tel:+34603242682 y correo como mailto', () => {
    const d = page!.doc;
    expect(d.querySelector('a[href="tel:+34603242682"]')?.textContent?.trim()).toBe('+34 603 24 26 82');
    expect(d.querySelector('a[href="mailto:hola@nandogomez.com"]')).not.toBeNull();
  });

  it('los datos del titular son exactamente 6 filas y no incluyen el Registro Mercantil', () => {
    const d = page!.doc;
    const terms = [...d.querySelectorAll('main dl > div > dt')].map((t) => t.textContent?.trim());
    expect(terms).toEqual(['Titular', 'Nombre comercial', 'NIF', 'Domicilio', 'Correo electrónico', 'Teléfono']);
    expect(d.body.textContent ?? '').not.toContain('Registro Mercantil');
  });

  it('el titular es la persona física con sus datos exactos', () => {
    expect(rows()).toMatchObject({
      Titular: 'Fernando Gómez Margiotta',
      'Nombre comercial': 'Nando Gómez',
      NIF: '45496623R',
      Domicilio: 'Moratín 31-33, 08302 Mataró (Barcelona), España',
    });
  });

  it('el NIF mostrado cumple el algoritmo de la letra del DNI', () => {
    const nif = rows().NIF!;
    expect(nif).toMatch(/^\d{8}[A-Z]$/);
    expect(nif[8]).toBe('TRWAGMYFPDXBNJZSQVHLCKE'[Number(nif.slice(0, 8)) % 23]);
  });

  it('el titular y la propiedad intelectual no citan a Digital Twofers; el objeto lo cita como facturador', () => {
    const d = page!.doc;
    const dl = d.querySelector('main dl')!.textContent ?? '';
    expect(dl).not.toContain('Twofers');
    expect(dl).not.toContain('B16988479');
    const sec = (n: number) => {
      const h = [...d.querySelectorAll('main h2')][n - 1]!;
      return h.nextElementSibling!.textContent ?? '';
    };
    expect(sec(4)).toContain('pertenecen a Fernando Gómez Margiotta');
    expect(sec(4)).not.toContain('Twofers');
    expect(sec(2)).toContain('titular Fernando Gómez Margiotta');
    expect(sec(2)).toContain('se contratan y facturan a través de Digital Twofers, S.L. (NIF B16988479)');
    expect(d.body.textContent ?? '').not.toContain('Denominación social');
  });

  it('la fecha de actualización sigue como pendiente entre corchetes', () => {
    expect(page!.doc.body.textContent ?? '').toContain('[FECHA DE PUBLICACIÓN]');
  });

  it('enlaza a privacidad y cookies sin .dc.html', () => {
    const d = page!.doc;
    expect(d.querySelector('main a[href="/privacidad"]')).not.toBeNull();
    expect(d.querySelector('main a[href="/cookies"]')).not.toBeNull();
    expect(page!.html).not.toMatch(/\.dc\.html/);
  });
});

describe.each(all)('A8 · pie y foco en $rel', ({ doc }) => {
  it('el pie tiene Aviso legal, Privacidad, Cookies y Configurar cookies', () => {
    const f = doc.querySelector('footer');
    expect(f).not.toBeNull();
    const link = (t: string) => [...f!.querySelectorAll('a')].find((a) => a.textContent?.trim() === t);
    expect(link('Aviso legal')?.getAttribute('href')).toBe('/aviso-legal');
    expect(link('Privacidad')?.getAttribute('href')).toBe('/privacidad');
    expect(link('Cookies')?.getAttribute('href')).toBe('/cookies');
    const cfg = f!.querySelector('[data-consent-open]');
    expect(cfg?.textContent?.trim()).toBe('Configurar cookies');
    expect(cfg?.getAttribute('href')).toBe('/cookies#configurar');
  });

  it('<main id="main"> tiene tabindex="-1" para el skip link', () => {
    expect(doc.querySelector('main#main')?.getAttribute('tabindex')).toBe('-1');
  });
});

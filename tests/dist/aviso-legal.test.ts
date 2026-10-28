import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { DIST, pages } from './helpers';

const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const page = all.find((p) => p.rel === 'aviso-legal.html');

describe('dist · /aviso-legal (P2a)', () => {
  it('existe dist/aviso-legal.html', () => {
    expect(page).toBeDefined();
  });

  it('canonical y og:url exactos', () => {
    const d = page!.doc;
    expect(d.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe('https://nandogomez.com/aviso-legal');
    expect(d.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://nandogomez.com/aviso-legal');
  });

  it('un h1, 7 h2 numerados y 7 pares dt/dd', () => {
    const d = page!.doc;
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    const h2 = [...d.querySelectorAll('main h2')].map((h) => h.textContent?.trim());
    expect(h2).toHaveLength(7);
    h2.forEach((t, i) => expect(t).toMatch(new RegExp(`^${i + 1}\\. `)));
    expect(d.querySelectorAll('main dl > div > dt')).toHaveLength(7);
    expect(d.querySelectorAll('main dl > div > dd')).toHaveLength(7);
  });

  it('teléfono como tel:+34603242682 y correo como mailto', () => {
    const d = page!.doc;
    expect(d.querySelector('a[href="tel:+34603242682"]')?.textContent?.trim()).toBe('+34 603 24 26 82');
    expect(d.querySelector('a[href="mailto:hola@nandogomez.com"]')).not.toBeNull();
  });

  it('los pendientes legales siguen visibles entre corchetes (no se inventan datos)', () => {
    const text = page!.doc.body.textContent ?? '';
    expect(text).toContain('[FECHA DE PUBLICACIÓN]');
    expect(text).toContain('[Registro Mercantil de Barcelona, tomo, folio, hoja e inscripción]');
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

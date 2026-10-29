// Adversario P8: robustez de src/lib/home.ts frente a lo que P9 añadirá (sin listas cerradas).
import { describe, expect, it } from 'vitest';
import { EMAIL } from '../../src/lib/site';
import { NAV, SECTIONS, contactHref, navFor } from '../../src/lib/home';

describe('adv P8 · home.ts', () => {
  const allIds = NAV.map((n) => n.id);

  it('navFor respeta el orden de NAV, no el de `present`', () => {
    expect(navFor([...allIds].reverse()).map((n) => n.id)).toEqual(allIds);
  });

  it('navFor ignora ids que no son de la nav y duplicados', () => {
    expect(navFor(['inicio', 'contacto', 'x', 'servicios', 'servicios']).map((n) => n.id)).toEqual(['servicios']);
    expect(navFor([])).toEqual([]);
  });

  it('navFor no muta NAV ni devuelve la misma referencia', () => {
    const before = JSON.stringify(NAV);
    const out = navFor(allIds);
    out.pop();
    expect(JSON.stringify(NAV)).toBe(before);
  });

  it('cada subconjunto de anclas produce exactamente sus enlaces (P9 solo añade ids)', () => {
    for (let mask = 0; mask < 1 << allIds.length; mask++) {
      const present = allIds.filter((_, i) => mask & (1 << i));
      expect(navFor(present).map((n) => n.id)).toEqual(present);
    }
  });

  it('contactHref: #contacto en cualquier posición; nunca otra ancla; mailto exacto si falta', () => {
    expect(contactHref(['contacto'])).toBe('#contacto');
    expect(contactHref([...allIds, 'contacto'])).toBe('#contacto');
    expect(contactHref(allIds)).toBe(`mailto:${EMAIL}`);
    expect(contactHref([])).toBe(`mailto:${EMAIL}`);
    expect(contactHref(['Contacto', 'contacto-form'])).toBe(`mailto:${EMAIL}`);
  });

  it('SECTIONS incluye inicio y servicios y no tiene duplicados', () => {
    expect(SECTIONS).toEqual(expect.arrayContaining(['inicio', 'servicios']));
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });

  it('ids de NAV con forma de ancla válida (sin #, espacios ni mayúsculas)', () => {
    for (const id of allIds) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

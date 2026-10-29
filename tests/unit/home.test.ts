import { describe, expect, it } from 'vitest';
import { EMAIL } from '../../src/lib/site';
import { NAV, contactHref, navFor } from '../../src/lib/home';

describe('home · nav y destino de contacto (anclas solo si existen)', () => {
  it('NAV: las 4 anclas del diseño, en orden', () => {
    expect(NAV.map((n) => n.id)).toEqual(['servicios', 'metodo', 'sobre-mi', 'twofers']);
  });

  it('navFor solo devuelve las anclas presentes en la página', () => {
    expect(navFor(['inicio', 'servicios']).map((n) => n.id)).toEqual(['servicios']);
    expect(navFor(['inicio', 'servicios', 'metodo', 'sobre-mi', 'twofers', 'contacto'])).toHaveLength(4);
  });

  it('contactHref: #contacto si existe; si no, mailto (nunca un ancla rota)', () => {
    expect(contactHref(['inicio', 'contacto'])).toBe('#contacto');
    expect(contactHref(['inicio', 'servicios'])).toBe(`mailto:${EMAIL}`);
  });
});

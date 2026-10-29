import { describe, expect, it } from 'vitest';
import { EMAIL, LINKEDIN, TWOFERS } from '../../src/lib/site';
import { NAV, SECTIONS, contactHref, navFor } from '../../src/lib/home';

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

describe('home · P9', () => {
  it('SECTIONS lista las 7 secciones y deja la nav con 4 enlaces y Contactar en #contacto', () => {
    expect([...SECTIONS]).toEqual(['inicio', 'servicios', 'metodo', 'sobre-mi', 'clientes', 'twofers', 'contacto']);
    expect(navFor(SECTIONS)).toHaveLength(4);
    expect(contactHref(SECTIONS)).toBe('#contacto');
  });
  it('URLs externas centralizadas en site.ts', () => {
    expect(TWOFERS).toBe('https://twofers.es');
    expect(LINKEDIN).toBe('https://www.linkedin.com/in/nandogomez/');
  });
});

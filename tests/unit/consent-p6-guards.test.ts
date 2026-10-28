import { describe, expect, it } from 'vitest';
import { parseConsent, readConsent, serializeConsent } from '../../src/lib/consent/core';

const NOW = 1_767_225_600;

describe('hora inválida (P5-adv)', () => {
  it.each([NaN, Infinity, -Infinity])('parseConsent con nowS=%s devuelve null', (n) => {
    expect(parseConsent('ng_consent=v1.granted.1767225600', n)).toBeNull();
  });
  it('readConsent con nowS=NaN devuelve null', () => {
    expect(readConsent(() => 'ng_consent=v1.granted.1767225600', NaN)).toBeNull();
  });
});

describe('serializeConsent recibe segundos', () => {
  it('acepta segundos de 10 cifras', () => {
    expect(serializeConsent(true, NOW, { secure: true })).toContain('v1.granted.1767225600;');
  });
  it('rechaza milisegundos', () => {
    expect(() => serializeConsent(true, NOW * 1000, { secure: true })).toThrow(RangeError);
  });
  it.each([NaN, Infinity, 0, -5, 999_999_999])('rechaza %s', (n) => {
    expect(() => serializeConsent(false, n, { secure: false })).toThrow(RangeError);
  });
  it('el resultado siempre se puede leer de vuelta', () => {
    const c = serializeConsent(false, NOW + 0.7, { secure: false }).split(';')[0]!;
    expect(parseConsent(c, NOW)).toEqual({ version: 1, analytics: false, savedAt: NOW });
  });
});

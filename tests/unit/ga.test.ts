import { describe, expect, it } from 'vitest';
import { getGaId, isValidGaId } from '../../src/lib/ga';

describe('isValidGaId', () => {
  it.each(['G-ABCD', 'G-TEST1234', 'G-ABCDEFGHIJKLMNO'])('acepta %s', (id) => expect(isValidGaId(id)).toBe(true));
  it.each(['', 'G-ABC', 'G-ABCDEFGHIJKLMNOP', 'g-abcd1234', 'G-AB CD', ' G-TEST1234', 'G-TEST1234\n', "G-X'];alert(1)//", undefined, null, 5])(
    'rechaza %j',
    (id) => expect(isValidGaId(id as string | undefined)).toBe(false),
  );
});

describe('getGaId', () => {
  it('recorta y valida', () => {
    expect(getGaId('  G-TEST1234 ')).toBe('G-TEST1234');
    expect(getGaId('G-TEST1234')).toBe('G-TEST1234');
  });
  it('devuelve null con vacío, ausente o inválido', () => {
    expect(getGaId('')).toBeNull();
    expect(getGaId('   ')).toBeNull();
    expect(getGaId('UA-123')).toBeNull();
    expect(getGaId(undefined)).toBeNull();
  });
  it('sin argumento lee PUBLIC_GA_ID del entorno de build (null en tests)', () => {
    expect(getGaId()).toBeNull();
  });
});

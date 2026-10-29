import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGaId, isValidGaId } from '../../src/lib/ga';

describe('isValidGaId', () => {
  it.each(['G-ABCD', 'G-TEST1234', 'G-ABCDEFGHIJKLMNO'])('acepta %s', (id) => expect(isValidGaId(id)).toBe(true));
  it.each(['', 'G-ABC', 'G-ABCDEFGHIJKLMNOP', 'g-abcd1234', 'G-AB CD', ' G-TEST1234', 'G-TEST1234\n', "G-X'];alert(1)//", undefined, null, 5])(
    'rechaza %j',
    (id) => expect(isValidGaId(id as string | undefined)).toBe(false),
  );
});

describe('getGaId', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('recorta y valida', () => {
    expect(getGaId('  G-TEST1234 ')).toBe('G-TEST1234');
    expect(getGaId('G-TEST1234')).toBe('G-TEST1234');
  });
  it('devuelve null con vacío, ausente o inválido', () => {
    vi.stubEnv('PUBLIC_GA_ID', ''); // `undefined` cae al entorno
    expect(getGaId('')).toBeNull();
    expect(getGaId('   ')).toBeNull();
    expect(getGaId('UA-123')).toBeNull();
    expect(getGaId(undefined)).toBeNull();
  });
  it('sin argumento lee PUBLIC_GA_ID del entorno de build (null si está vacío)', () => {
    vi.stubEnv('PUBLIC_GA_ID', '');
    expect(getGaId()).toBeNull();
  });
  it('sin argumento y con un ID válido en el entorno lo devuelve', () => {
    vi.stubEnv('PUBLIC_GA_ID', 'G-ABCD1234');
    expect(getGaId()).toBe('G-ABCD1234');
  });
});

describe('una sola regex', () => {
  it('CookieTable (fijada por adv-p3) y release-check usan la misma que ga.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const re = '^G-[A-Z0-9]{4,15}$';
    expect(readFileSync('src/components/CookieTable.astro', 'utf8')).toContain(`/${re}/`);
    expect(readFileSync('scripts/lib/release-check.mjs', 'utf8')).toContain(`/${re}/`);
    expect(readFileSync('src/lib/ga.ts', 'utf8')).toContain(`/${re}/`);
  });
});

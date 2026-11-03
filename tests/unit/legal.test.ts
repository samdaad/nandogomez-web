import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as legal from '../../src/lib/legal';

describe('legal (pendientes en un solo sitio)', () => {
  it('la fecha de publicación está fijada y legal.ts no tiene pendientes entre corchetes', () => {
    expect(legal.LEGAL_UPDATED).toBe('2 de noviembre de 2026');
    for (const v of Object.values(legal)) expect(String(v)).not.toMatch(/\[[^\]]*\]/);
    expect(readFileSync(join(import.meta.dirname, '../../src/lib/legal.ts'), 'utf8')).not.toMatch(/'\[[^\]]*\]'/);
  });

  it('ya no exporta REGISTRO_MERCANTIL (decisión de Nando, 29/10/2026)', () => {
    expect(Object.keys(legal)).toEqual(['LEGAL_UPDATED']);
    expect('REGISTRO_MERCANTIL' in legal).toBe(false);
  });
});

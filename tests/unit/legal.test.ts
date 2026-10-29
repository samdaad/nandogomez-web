import { describe, expect, it } from 'vitest';
import * as legal from '../../src/lib/legal';

describe('legal (pendientes en un solo sitio)', () => {
  it('la fecha sigue como marcador entre corchetes hasta el día de publicación', () => {
    expect(legal.LEGAL_UPDATED).toBe('[FECHA DE PUBLICACIÓN]');
  });

  it('ya no exporta REGISTRO_MERCANTIL (decisión de Nando, 29/10/2026)', () => {
    expect(Object.keys(legal)).toEqual(['LEGAL_UPDATED']);
    expect('REGISTRO_MERCANTIL' in legal).toBe(false);
  });
});

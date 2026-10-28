import { describe, expect, it } from 'vitest';
import { LEGAL_UPDATED, REGISTRO_MERCANTIL } from '../../src/lib/legal';

describe('legal (pendientes en un solo sitio)', () => {
  it('siguen como marcadores entre corchetes hasta que Nando aporte los datos', () => {
    expect(LEGAL_UPDATED).toBe('[FECHA DE PUBLICACIÓN]');
    expect(registroOk(REGISTRO_MERCANTIL)).toBe(true);
  });
});

function registroOk(s: string): boolean {
  return /^\[Registro Mercantil de Barcelona[^\]]*\]$/.test(s);
}

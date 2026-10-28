import { describe, expect, it } from 'vitest';
import { EMAIL, SITE_URL } from '../../src/lib/site';

describe('site', () => {
  it('SITE_URL es el origen canónico, sin barra final', () => {
    expect(SITE_URL).toBe('https://nandogomez.com');
  });

  it('EMAIL es la dirección de contacto del dominio', () => {
    expect(EMAIL).toBe('hola@nandogomez.com');
  });
});

import { describe, expect, it } from 'vitest';
import { EMAIL, SITE_URL, canonicalUrl } from '../../src/lib/site';

describe('site', () => {
  it('SITE_URL es el origen canónico, sin barra final', () => {
    expect(SITE_URL).toBe('https://nandogomez.com');
  });

  it('EMAIL es la dirección de contacto del dominio', () => {
    expect(EMAIL).toBe('hola@nandogomez.com');
  });
});

describe('canonicalUrl', () => {
  it.each([
    ['/', 'https://nandogomez.com/'],
    ['/index.html', 'https://nandogomez.com/'],
    ['/aviso-legal.html', 'https://nandogomez.com/aviso-legal'],
    ['/aviso-legal', 'https://nandogomez.com/aviso-legal'],
    ['/aviso-legal/', 'https://nandogomez.com/aviso-legal'],
    ['//evil.com/x', 'https://nandogomez.com/evil.com/x'],
    ['/\\evil.com/x', 'https://nandogomez.com/evil.com/x'],
    ['/aviso-legal.html/', 'https://nandogomez.com/aviso-legal'],
    ['/aviso-legal.HTML', 'https://nandogomez.com/aviso-legal'],
    ['/aviso-legal?a=1#b', 'https://nandogomez.com/aviso-legal'],
    ['/index/', 'https://nandogomez.com/'],
    ['/INDEX', 'https://nandogomez.com/'],
    ['/Index.HTML', 'https://nandogomez.com/'],
    ['/\t/evil.com/x', 'https://nandogomez.com/evil.com/x'],
    ['\t//evil.com', 'https://nandogomez.com/evil.com'],
    ['/\n/evil.com', 'https://nandogomez.com/evil.com'],
    ['/\r\\evil.com', 'https://nandogomez.com/evil.com'],
  ])('%s -> %s', (path, expected) => {
    expect(canonicalUrl(path)).toBe(expected);
    expect(new URL(canonicalUrl(path)).host).toBe('nandogomez.com');
  });
});

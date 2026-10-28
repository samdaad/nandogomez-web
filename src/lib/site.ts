export const SITE_URL = 'https://nandogomez.com';
export const EMAIL = 'hola@nandogomez.com';
// Debe coincidir con el token `bg` (lo comprueba tests/unit/tokens.test.ts).
export const THEME_COLOR = '#0e0f11';

/** Normaliza una ruta a su URL canónica: sin query, hash, `.html` ni `/index`, y sin barra final (salvo la raíz). */
export function canonicalUrl(pathname: string): string {
  const path = pathname
    .replace(/[?#].*$/s, '')
    .replace(/\\/g, '/') // `\` cuenta como `/` en new URL: evita `/\evil.com`
    .replace(/^\/*/, '/') // `//evil.com/x` no debe salir a otro dominio
    .replace(/\/+$/, '')
    .replace(/\.html$/i, '')
    .replace(/\/index$/, '');
  return new URL(path === '' ? '/' : path, SITE_URL).href;
}

export const SITE_URL = 'https://nandogomez.com';
export const EMAIL = 'hola@nandogomez.com';
// Debe coincidir con el token `bg` (lo comprueba tests/unit/tokens.test.ts).
export const THEME_COLOR = '#0e0f11';

/** Normaliza una ruta a su URL canónica: sin `.html`, sin `/index`, sin barra final (salvo la raíz). */
export function canonicalUrl(pathname: string): string {
  let path = pathname.replace(/\.html$/, '').replace(/\/index$/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return new URL(path === '' ? '/' : path, SITE_URL).href;
}

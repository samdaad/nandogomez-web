export const SITE_URL = 'https://nandogomez.com';
export const EMAIL = 'hola@nandogomez.com';
export const TWOFERS = 'https://twofers.es';
export const LINKEDIN = 'https://www.linkedin.com/in/nandogomez/';
// Debe coincidir con el token `bg` (lo comprueba tests/unit/tokens.test.ts).
export const THEME_COLOR = '#0e0f11';

/** Normaliza una ruta a su URL canónica: sin query, hash, `.html` ni `/index`, y sin barra final (salvo la raíz). */
export function canonicalUrl(pathname: string): string {
  const path = pathname
    .replace(/[\t\n\r]/g, '') // WHATWG URL los elimina: `/\t/evil.com` sería `//evil.com`
    .replace(/[?#].*$/s, '')
    .replace(/\\/g, '/') // `\` cuenta como `/` en new URL: evita `/\evil.com`
    .replace(/^\/*/, '/') // `//evil.com/x` no debe salir a otro dominio
    .replace(/\/+$/, '')
    .replace(/\.html$/i, '')
    .replace(/\/index$/i, '');
  const url = new URL(path === '' ? '/' : path, SITE_URL);
  // `/..//evil.com` resuelve a `//evil.com`: se colapsan las barras repetidas.
  if (url.origin !== SITE_URL) return `${SITE_URL}/`;
  // Tras resolver y colapsar (`/a/b/..`, `/x//.html`) puede quedar una barra final: fuera, salvo en la raíz.
  const clean = url.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return `${SITE_URL}${clean}`;
}
export const PHONE_DISPLAY = '+34 603 24 26 82';
export const PHONE_HREF = 'tel:+34603242682';

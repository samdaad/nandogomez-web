// Lógica pura de la cookie `ng_consent` (contrato: docs/PLAN.md §4.1 y §4.2).
export const CONSENT_COOKIE = 'ng_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_S = 31_536_000;
const FUTURE_TOLERANCE_S = 86_400;
const VALUE_RE = /^v([1-9]\d{0,2})\.(granted|denied)\.(\d{10})$/;

export type Consent = { version: number; analytics: boolean; savedAt: number };

// Solo se recortan espacios y tabuladores (OWS); un salto de línea invalida el valor.
const ows = (s: string) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function cookiePairs(header: string): [string, string][] {
  return header.split(';').map((part) => {
    const i = part.indexOf('=');
    const name = ows(i < 0 ? part : part.slice(0, i));
    return [name, i < 0 ? '' : ows(part.slice(i + 1))];
  });
}

/** `null` = sin decisión válida: falta, malformada, duplicada, de versión menor, caducada o con fecha futura. */
export function parseConsent(cookieHeader: string, nowS: number, minVersion = CONSENT_VERSION): Consent | null {
  const found = cookiePairs(cookieHeader).filter(([name]) => name === CONSENT_COOKIE);
  if (found.length !== 1) return null;
  const m = VALUE_RE.exec(found[0]![1]);
  if (!m) return null;
  const version = Number(m[1]);
  const savedAt = Number(m[3]);
  if (version < minVersion) return null;
  if (savedAt - nowS > FUTURE_TOLERANCE_S) return null;
  if (nowS - savedAt > CONSENT_MAX_AGE_S) return null;
  return { version, analytics: m[2] === 'granted', savedAt };
}

export function serializeConsent(analytics: boolean, nowS: number, opts: { secure: boolean }): string {
  const value = `v${CONSENT_VERSION}.${analytics ? 'granted' : 'denied'}.${Math.floor(nowS)}`;
  return `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax${opts.secure ? '; Secure' : ''}`;
}

export function needsPrompt(c: Consent | null): boolean {
  return c === null;
}

/** `Secure` se omite solo con `http:` en localhost o 127.0.0.1. */
export function useSecureAttribute(protocol: string, hostname: string): boolean {
  return !(protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1'));
}

export function gaCookiesToClear(cookieHeader: string): string[] {
  const names = cookiePairs(cookieHeader)
    .map(([name]) => name)
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  return [...new Set(names)];
}

export function expireCookieWrites(name: string, hostname: string): string[] {
  const host = hostname.toLowerCase();
  const base = `${name}=; Max-Age=0; Path=/`;
  const writes = [base, `${base}; Domain=${host}`];
  if (host === 'nandogomez.com' || host.endsWith('.nandogomez.com')) writes.push(`${base}; Domain=.nandogomez.com`);
  return writes;
}

/** Lectura tolerante: si `document.cookie` lanza (cookies bloqueadas), no hay decisión. */
export function readConsent(read: () => string, nowS: number): Consent | null {
  try {
    const header = read();
    return typeof header === 'string' ? parseConsent(header, nowS) : null;
  } catch {
    return null;
  }
}

/** Devuelve `false` si el navegador no deja escribir. */
export function writeConsent(write: (cookie: string) => void, analytics: boolean, nowS: number, opts: { secure: boolean }): boolean {
  try {
    write(serializeConsent(analytics, nowS, opts));
    return true;
  } catch {
    return false;
  }
}

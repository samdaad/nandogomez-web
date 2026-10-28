// Lógica pura de check:release (PLAN §4.5). El CLI está en scripts/check-release.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Patrón del plan: un `[…]` de 2+ caracteres sin saltos de línea. */
const PENDING = /\[[^\]\n]{2,}\]/g;
/** Mismo criterio que CookieTable.astro. */
const GA_ID = /^G-[A-Z0-9]{4,15}$/;
const ENTITIES = { lbrack: '[', rbrack: ']', lsqb: '[', rsqb: ']', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** @param {string | undefined} id */
export const isValidGaId = (id) => typeof id === 'string' && GA_ID.test(id);

/** @param {string} s */
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (name) return ENTITIES[/** @type {keyof typeof ENTITIES} */ (name.toLowerCase())] ?? m;
    const cp = dec ? Number(dec) : parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });

/**
 * Nodos de texto visibles: sin comentarios, `script` ni `style` (como el plan) y sin atributos.
 * `noscript` SÍ cuenta: lo ve quien no tiene JS, y la página de cookies lo usa.
 * @param {string} html @returns {string[]}
 */
export function visibleTextNodes(html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b(?:"[^"]*"|'[^']*'|[^>"'])*>[\s\S]*?<\/\1\s*>/gi, '');
  const tag = /<\/?[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
  return clean.split(tag).map(decode).filter((t) => t.trim() !== '');
}

/** @param {string} html @returns {string[]} */
export const findPendingInHtml = (html) => visibleTextNodes(html).flatMap((t) => t.match(PENDING) ?? []);

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return htmlFiles(p);
      return n.endsWith('.html') ? [p] : [];
    });
}

/**
 * @param {string} dist @param {{ gaId?: string | undefined }} opts
 * @returns {{ pending: { page: string, text: string }[], gaIdValid: boolean, distFound: boolean, ok: boolean }}
 */
export function scanDist(dist, { gaId } = {}) {
  const distFound = existsSync(dist);
  const pending = distFound
    ? htmlFiles(dist).flatMap((f) =>
        findPendingInHtml(readFileSync(f, 'utf8')).map((text) => ({ page: relative(dist, f).split('\\').join('/'), text })),
      )
    : [];
  const gaIdValid = isValidGaId(gaId);
  return { pending, gaIdValid, distFound, ok: distFound && pending.length === 0 && gaIdValid };
}

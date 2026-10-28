// Lógica pura de check:release (PLAN §4.5). El CLI está en scripts/check-release.mjs.
// El HTML se lee con parse5 (parser conforme a la especificación), no con expresiones regulares.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'parse5';

/** Patrón del plan: un `[…]` de 2+ caracteres sin saltos de línea (se aplica tras colapsar blancos). */
const PENDING = /\[[^\]\n]{2,}\]/g;
/** Mismo criterio que CookieTable.astro (que hace trim antes). */
const GA_ID = /^G-[A-Z0-9]{4,15}$/;
/** Elementos que cortan el texto en bloques: un corchete no puede abarcar dos de ellos. */
const INLINE = new Set('a abbr b bdi bdo cite code data del dfn em i ins kbd mark q s samp small span strong sub sup time u var wbr font tt big nobr'.split(' '));
/** Elementos cuyo contenido no es texto visible. */
const SKIP = new Set(['script', 'style']);
/** Atributos que ve el visitante en cualquier elemento. */
const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];

/** @param {string | undefined} id */
export const isValidGaId = (id) => typeof id === 'string' && GA_ID.test(id.trim());

// Variantes en mayúsculas (&LSQB;) que el estándar no define pero que se marcan por prudencia.
/** @param {string} s */
const collapse = (s) =>
  s
    .replace(/&(?:lsqb|lbrack);/gi, '[')
    .replace(/&(?:rsqb|rbrack);/gi, ']')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Textos que ve el visitante o indexa Google: texto por bloque (blancos colapsados), `<title>`, metas de
 * descripción/og/twitter y los atributos alt, title, placeholder, aria-label y value (input/button/option).
 * Cuentan `noscript`, `template`, `textarea` y `svg`; no cuentan `script`, `style`, comentarios, data-*, href, src, class ni id.
 * Un `<script>`/`<style>` sin cerrar se trata como texto (falla del lado seguro).
 * @param {string} html @returns {string[]}
 */
export function visibleTextNodes(html) {
  /** @type {string[]} */
  const out = [];
  let buf = '';
  const flush = () => {
    const t = collapse(buf);
    if (t) out.push(t);
    buf = '';
  };
  /** @param {string | undefined} v */
  const add = (v) => {
    const t = v ? collapse(v) : '';
    if (t) out.push(t);
  };
  /** @param {any} node */
  const walk = (node) => {
    for (const c of node.childNodes ?? []) {
      if (c.nodeName === '#text') buf += c.value;
      else if (c.nodeName === '#comment' || c.nodeName === '#documentType') continue;
      else if (c.tagName) visit(c);
    }
  };
  /** @param {any} el */
  const visit = (el) => {
    const tag = String(el.tagName).toLowerCase();
    /** @type {Record<string, string>} */
    const a = {};
    for (const { name, value } of el.attrs ?? []) a[name] = value;
    const inline = INLINE.has(tag);
    if (!inline) flush();
    for (const n of ATTRS) add(a[n]);
    if (['input', 'button', 'option'].includes(tag) && a['type']?.toLowerCase() !== 'hidden') add(a['value']);
    if (tag === 'meta') {
      const name = (a['name'] ?? '').toLowerCase();
      const prop = (a['property'] ?? '').toLowerCase();
      if (name === 'description' || name.startsWith('twitter:') || prop.startsWith('og:')) add(a['content']);
    }
    if (SKIP.has(tag) && el.sourceCodeLocation?.endTag) return;
    if (tag === 'template' && el.content) walk(el.content);
    else walk(el);
    if (!inline) flush();
  };
  walk(parse(html, { sourceCodeLocationInfo: true }));
  flush();
  return out;
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
 * @returns {{ pending: { page: string, text: string }[], gaIdValid: boolean, distFound: boolean, htmlCount: number, ok: boolean }}
 */
export function scanDist(dist, { gaId } = {}) {
  const distFound = existsSync(dist);
  const files = distFound ? htmlFiles(dist) : [];
  const pending = files.flatMap((f) =>
    findPendingInHtml(readFileSync(f, 'utf8')).map((text) => ({ page: relative(dist, f).split('\\').join('/'), text })),
  );
  const gaIdValid = isValidGaId(gaId);
  return { pending, gaIdValid, distFound, htmlCount: files.length, ok: files.length > 0 && pending.length === 0 && gaIdValid };
}

// Lógica pura de check:release (PLAN §4.5). El CLI está en scripts/check-release.mjs.
// El HTML se lee con parse5 (parser conforme a la especificación), no con expresiones regulares.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'parse5';

/** Patrón del plan: un `[…]` de 2+ caracteres sin saltos de línea (se aplica tras colapsar blancos). */
const PENDING = /\[[^\]\n]{2,}\]/g;
/** Mismo criterio que CookieTable.astro (que hace trim antes). */
const GA_ID = /^G-[A-Z0-9]{4,15}$/;
/** Lista cerrada de elementos de bloque: cortan el texto. Todo lo demás (desconocidos y custom elements incluidos) es en línea. */
const BLOCK = new Set(
  ('html head body title noscript template p div li dt dd h1 h2 h3 h4 h5 h6 section article header footer main nav aside table thead tbody tfoot tr td th caption ' +
    'colgroup col blockquote pre figure figcaption form fieldset legend ul ol dl menu br hr address details summary select option optgroup textarea button ' +
    'datalist iframe object video audio canvas meta link base hgroup search dialog').split(' '),
);
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

/** Profundidad máxima de documentos anidados (iframe srcdoc). */
const MAX_SRCDOC_DEPTH = 3;

/**
 * Textos que ve el visitante o indexa Google: texto por bloque (blancos colapsados), `<title>`, metas de
 * descripción/og/twitter, los atributos alt, title, placeholder, aria-label y label (option/optgroup),
 * `value` (input/button/option) y el `srcdoc` de los iframe (analizado igual, con límite de profundidad).
 * Cuentan `noscript` (se lee como elementos: scriptingEnabled=false), `template`, `textarea` y `svg`;
 * no cuentan `script`, `style`, comentarios, data-*, href, src, class ni id.
 * Un `<script>`/`<style>` sin cerrar se trata como texto (falla del lado seguro).
 * El recorrido es iterativo: un árbol muy profundo no agota la pila.
 * @param {string} html @param {number} [depth] @returns {string[]}
 */
export function visibleTextNodes(html, depth = 0) {
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
  /** @type {any[]} */
  const stack = [];
  /** @param {any} node */
  const pushChildren = (node) => {
    const kids = node.childNodes ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  };
  pushChildren(parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false }));
  while (stack.length) {
    const c = stack.pop();
    if (c.closeBlock) {
      flush();
      continue;
    }
    if (c.nodeName === '#text') {
      buf += c.value;
      continue;
    }
    if (!c.tagName) continue; // comentarios y doctype
    const tag = String(c.tagName).toLowerCase();
    /** @type {Record<string, string>} */
    const a = {};
    for (const { name, value } of c.attrs ?? []) a[name] = value;
    const block = BLOCK.has(tag);
    if (block) flush();
    for (const n of ATTRS) add(a[n]);
    if (['option', 'optgroup'].includes(tag)) add(a['label']);
    if (['input', 'button', 'option'].includes(tag) && a['type']?.toLowerCase() !== 'hidden') add(a['value']);
    if (tag === 'meta') {
      const name = (a['name'] ?? '').toLowerCase();
      const prop = (a['property'] ?? '').toLowerCase();
      if (name === 'description' || name.startsWith('twitter:') || prop.startsWith('twitter:') || prop.startsWith('og:')) add(a['content']);
    }
    if (tag === 'iframe' && a['srcdoc'] && depth < MAX_SRCDOC_DEPTH) out.push(...visibleTextNodes(a['srcdoc'], depth + 1));
    if (SKIP.has(tag) && c.sourceCodeLocation?.endTag) continue;
    if (block) stack.push({ closeBlock: true });
    pushChildren(tag === 'template' && c.content ? c.content : c);
  }
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
      return /\.html?$/i.test(n) ? [p] : [];
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

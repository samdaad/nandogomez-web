// Adversario P10: _headers evaluado con la semántica documentada de Cloudflare Pages
// (https://developers.cloudflare.com/pages/configuration/headers/): patrón sin sangría, cabeceras sangradas,
// `#` comentario, `! Nombre` quita, splat `*` voraz (uno por URL), `:placeholder` que en el host no cruza `.`
// y en la ruta no cruza `/`; las reglas relativas valen para cualquier host; varias reglas se acumulan y una
// cabecera repetida se une con coma. Límites: 100 reglas, 2000 caracteres por línea.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPendingInHtml } from '../../scripts/lib/release-check.mjs';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const raw = read('public/_headers');

type Rule = { pattern: string; set: [string, string][]; detach: string[] };

function parseCf(text: string): Rule[] {
  const rules: Rule[] = [];
  let cur: Rule | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (/^\S/.test(line)) {
      cur = { pattern: line.trim(), set: [], detach: [] };
      rules.push(cur);
      continue;
    }
    if (!cur) throw new Error(`cabecera sin regla: ${line}`);
    const t = line.trim();
    if (t.startsWith('! ')) {
      cur.detach.push(t.slice(2).trim().toLowerCase());
      continue;
    }
    const i = t.indexOf(':');
    if (i <= 0) throw new Error(`línea inválida: ${line}`);
    cur.set.push([t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]);
  }
  return rules;
}

const esc = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
function segRe(seg: string, delim: string): string {
  return seg
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((p) => (p === '*' ? '.*' : /^:[A-Za-z]\w*$/.test(p) ? `[^${delim}]+` : esc(p)))
    .join('');
}
function matches(pattern: string, url: string): boolean {
  const u = new URL(url);
  if (/^https?:\/\//.test(pattern)) {
    const m = /^(https?):\/\/([^/]+)(\/.*)$/.exec(pattern)!;
    if (`${m[1]}:` !== u.protocol) return false;
    if (!new RegExp(`^${segRe(m[2]!, '.')}$`).test(u.hostname)) return false;
    return new RegExp(`^${segRe(m[3]!, '/')}$`).test(u.pathname);
  }
  return new RegExp(`^${segRe(pattern, '/')}$`).test(u.pathname);
}
function headersFor(url: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of parseCf(raw)) {
    if (!matches(r.pattern, url)) continue;
    for (const [k, v] of r.set) out.set(k, out.has(k) ? `${out.get(k)}, ${v}` : v);
    for (const k of r.detach) out.delete(k);
  }
  return out;
}

const PROD = ['https://nandogomez.com/', 'https://nandogomez.com/aviso-legal', 'https://nandogomez.com/404',
  'https://nandogomez.com/no-existe', 'https://nandogomez.com/_astro/x.css', 'https://nandogomez.com/favicon.svg',
  'https://nandogomez.com/sitemap-index.xml', 'https://www.nandogomez.com/'];
const PREVIEW = ['https://nandogomez-web.pages.dev/', 'https://nandogomez-web.pages.dev/cookies',
  'https://feat-web-p10.nandogomez-web.pages.dev/', 'https://a1b2c3d4.nandogomez-web.pages.dev/_astro/x.js'];
const SECURITY = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options',
  'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];

describe('adv P10 · _headers con la sintaxis de Cloudflare', () => {
  it('respeta los límites: ≤ 100 reglas, ≤ 2000 caracteres por línea, sin BOM ni CRLF', () => {
    expect(parseCf(raw).length).toBeLessThanOrEqual(100);
    for (const l of raw.split('\n')) expect(l.length).toBeLessThanOrEqual(2000);
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    expect(raw).not.toContain('\r');
  });

  it('cada patrón tiene como mucho un splat y placeholders no repetidos', () => {
    for (const { pattern } of parseCf(raw)) {
      expect((pattern.match(/\*/g) ?? []).length).toBeLessThanOrEqual(1);
      const names = pattern.match(/:[A-Za-z]\w*/g) ?? [];
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('los nombres de cabecera son tokens HTTP válidos y no hay `!` (nada que quitar)', () => {
    for (const r of parseCf(raw)) {
      expect(r.detach).toEqual([]);
      for (const [k] of r.set) expect(k).toMatch(/^[!#$%&'*+.^_`|~0-9a-z-]+$/);
    }
  });

  it.each([...PROD, ...PREVIEW])('%s recibe todas las cabeceras de seguridad, sin duplicar', (url) => {
    const h = headersFor(url);
    for (const k of SECURITY) expect(h.get(k), k).toBeTruthy();
    // Una CSP repetida se uniría con coma = dos políticas: no debe pasar.
    expect(h.get('content-security-policy')).not.toContain(', ');
  });

  it.each(PROD)('%s NO lleva X-Robots-Tag (producción indexable)', (url) => {
    expect(headersFor(url).has('x-robots-tag')).toBe(false);
  });

  it.each(PREVIEW)('%s lleva X-Robots-Tag: noindex exactamente una vez', (url) => {
    expect(headersFor(url).get('x-robots-tag')).toBe('noindex');
  });

  it('un dominio que solo se parece a pages.dev no recibe noindex por accidente ni rompe el patrón', () => {
    expect(headersFor('https://pages.dev.nandogomez.com/').has('x-robots-tag')).toBe(false);
  });

  it('solo /_astro/* es inmutable (HTML, sitemap y favicon no)', () => {
    expect(headersFor('https://nandogomez.com/_astro/a.B1.css').get('cache-control')).toContain('immutable');
    for (const u of ['https://nandogomez.com/', 'https://nandogomez.com/favicon.svg', 'https://nandogomez.com/sitemap-0.xml'])
      expect(headersFor(u).has('cache-control')).toBe(false);
  });

  it('A16 · el fichero es literalmente el bloque de §7 de docs/PLAN.md', () => {
    const plan = read('docs/PLAN.md');
    const sec7 = plan.slice(plan.indexOf('## 7. Riesgos y seguridad'));
    const block = /```\n([\s\S]*?)```/.exec(sec7)![1]!;
    expect(raw.trimEnd()).toBe(block.trimEnd());
  });
});

// Coincidencia de host-source de CSP3 (solo lo que usa este fichero: esquema https y `*.` como prefijo).
function cspAllows(policy: string, directive: string, url: string): boolean {
  const dirs = new Map(policy.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k!, v] as const));
  const srcs = dirs.get(directive) ?? dirs.get('default-src') ?? [];
  const u = new URL(url);
  return srcs.some((s) => {
    if (s === "'self'") return u.origin === 'https://nandogomez.com';
    const m = /^https:\/\/(\*\.)?([^/]+)$/.exec(s);
    if (!m || u.protocol !== 'https:') return false;
    return m[1] ? u.hostname.endsWith(`.${m[2]}`) : u.hostname === m[2];
  });
}
const CSP = headersFor('https://nandogomez.com/').get('content-security-policy')!;

describe('adv P10 · CSP frente a lo que hace gtag.js (Consent Mode básico, sin señales)', () => {
  it.each([
    ['script-src', 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234'],
    ['connect-src', 'https://region1.google-analytics.com/g/collect?v=2'],
    ['connect-src', 'https://www.google-analytics.com/g/collect?v=2'],
    ['connect-src', 'https://region1.analytics.google.com/g/collect?v=2'],
    ['connect-src', 'https://www.googletagmanager.com/a?id=G-TEST1234'],
    ['img-src', 'https://www.google-analytics.com/g/collect?v=2'],
    ['img-src', 'https://www.googletagmanager.com/td?id=G-TEST1234'],
    ['script-src', 'https://nandogomez.com/_astro/x.js'],
    ['font-src', 'https://nandogomez.com/_astro/geist.woff2'],
  ])('%s permite %s', (dir, url) => {
    expect(cspAllows(CSP, dir, url)).toBe(true);
  });

  it.each([
    ['script-src', 'https://www.google-analytics.com/analytics.js'],
    ['script-src', 'https://evil.example/x.js'],
    ['connect-src', 'https://googletagmanager.com.evil.example/'],
    ['img-src', 'https://evil.example/p.gif'],
    ['frame-src', 'https://www.googletagmanager.com/ns.html'],
    ['style-src', 'https://fonts.googleapis.com/css'],
    ['font-src', 'https://fonts.gstatic.com/x.woff2'],
  ])('%s bloquea %s', (dir, url) => {
    expect(cspAllows(CSP, dir, url)).toBe(false);
  });

  it('sin unsafe-*, sin data:/blob:, sin http: y con las directivas sin fallback a default-src', () => {
    expect(CSP).not.toMatch(/'unsafe-|'strict-dynamic'|\bdata:|\bblob:|http:\/\//);
    for (const d of ['object-src', 'base-uri', 'form-action', 'frame-ancestors']) expect(CSP).toContain(`${d} `);
  });
});

describe('adv P10 · HSTS', () => {
  const v = headersFor('https://nandogomez.com/').get('strict-transport-security')!;
  it('max-age ≥ 1 año, sin includeSubDomains (§7) y sin preload (que exige includeSubDomains)', () => {
    expect(Number(/max-age=(\d+)/.exec(v)![1])).toBeGreaterThanOrEqual(31_536_000);
    expect(v).not.toMatch(/includesubdomains/i);
    expect(v).not.toMatch(/preload/i);
  });
});

describe('adv P10 · favicon.svg', () => {
  const svg = read('public/favicon.svg');
  const tokens = JSON.parse(read('design/tokens.json')) as { color: { tokens: { name: string; value: string }[] } };
  const values = new Set(tokens.color.tokens.map((t) => t.value.toLowerCase()));

  it('no tiene script, manejadores, foreignObject ni referencias externas', () => {
    expect(svg).not.toMatch(/<script|\son\w+\s*=|foreignObject|xlink:href|\shref\s*=|url\(|@import|<style|<image/i);
    // El único http(s) permitido es el espacio de nombres.
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:/);
  });

  it('cada hex es exactamente el valor de un token de color', () => {
    const hex = [...svg.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
    expect(hex.length).toBeGreaterThan(0);
    for (const h of hex) expect(values.has(h), h).toBe(true);
  });

  it('es un SVG bien formado (una sola raíz, etiquetas cerradas)', () => {
    expect(svg.trim()).toMatch(/^<svg\b[\s\S]*<\/svg>$/);
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
  });
});

describe('adv P10 · check:release vigila las metas OG/Twitter', () => {
  const head = (meta: string): string =>
    `<!doctype html><html lang="es"><head><title>T</title>${meta}</head><body><p>ok</p></body></html>`;
  it.each([
    '<meta property="og:description" content="Datos [FECHA DE PUBLICACIÓN]">',
    '<meta property="og:title" content="[TÍTULO]">',
    '<meta property="og:image:alt" content="Foto [ALT]">',
    '<meta name="twitter:description" content="[PENDIENTE]">',
    '<meta property="OG:Description" content="[MAYÚSCULAS]">',
  ])('detecta el pendiente en %s', (m) => {
    expect(findPendingInHtml(head(m)).length).toBe(1);
  });
});

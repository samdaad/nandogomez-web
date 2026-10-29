// A16 · public/_headers (docs/PLAN.md §7). La CSP no admite nada en línea porque A5 (dist-test) garantiza que
// ninguna página tiene script/style/atributos en línea: por eso no hace falta 'unsafe-inline' ni hashes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const raw = readFileSync(join(ROOT, 'public/_headers'), 'utf8');

/** Formato de Cloudflare Pages: línea sin sangría = patrón; líneas con sangría = `Nombre: valor`. */
function parse(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let cur: Map<string, string> | undefined;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (/^\S/.test(line)) {
      cur = new Map();
      out.set(line.trim(), cur);
    } else {
      const i = line.indexOf(':');
      cur?.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
    }
  }
  return out;
}
const rules = parse(raw);
const all = rules.get('/*')!;
const csp = new Map(
  (all.get('content-security-policy') ?? '').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k!, v] as const),
);

describe('A16 · _headers', () => {
  it('define /*, /_astro/* y los dos patrones de pages.dev', () => {
    expect([...rules.keys()]).toEqual(['/*', '/_astro/*', 'https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*']);
  });

  it('CSP sin unsafe-inline, unsafe-eval ni comodines amplios', () => {
    const v = all.get('content-security-policy') ?? '';
    expect(v).not.toBe('');
    expect(v).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|data:|blob:/);
    for (const [, srcs] of csp) {
      for (const s of srcs) {
        expect(s).not.toBe('*');
        expect(s).not.toMatch(/^(https?|wss?):$/);
        expect(s).not.toMatch(/^(https?:\/\/)?\*\.(com|es|dev)$/);
      }
    }
  });

  it('script-src permite exactamente self y googletagmanager', () => {
    expect(csp.get('script-src')).toEqual(["'self'", 'https://*.googletagmanager.com']);
  });

  it('el resto de directivas son las de §7', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'"]);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'https://*.google-analytics.com', 'https://*.googletagmanager.com']);
    expect(csp.get('connect-src')).toEqual([
      "'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com',
    ]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('el origen del script de gtag cabe en script-src', () => {
    const src = readFileSync(join(ROOT, 'src/lib/consent/analytics.ts'), 'utf8').match(/SRC = '(https:\/\/[^/']+)\//)![1]!;
    const host = new URL(src).hostname;
    expect(host.endsWith('.googletagmanager.com')).toBe(true);
    expect(csp.get('script-src')).toContain('https://*.googletagmanager.com');
  });

  it('resto de cabeceras', () => {
    expect(all.get('strict-transport-security')).toBe('max-age=31536000');
    expect(all.get('x-content-type-options')).toBe('nosniff');
    expect(all.get('x-frame-options')).toBe('DENY');
    expect(all.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(all.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    );
    expect(all.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('assets con hash inmutables y previews con noindex', () => {
    expect(rules.get('/_astro/*')?.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(rules.get('https://:project.pages.dev/*')?.get('x-robots-tag')).toBe('noindex');
    expect(rules.get('https://:version.:project.pages.dev/*')?.get('x-robots-tag')).toBe('noindex');
  });
});

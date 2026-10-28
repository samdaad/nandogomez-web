// Tests del adversario para P3 (canonicalUrl sin barra final, CookieTable, 404, LegalLayout).
// Regresión: no se modifican ni se borran. Cubren docs/PLAN.md §3, §4.2 (isValidGaId), §5 y P3.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_URL, canonicalUrl } from '../../src/lib/site';

const ROOT = join(import.meta.dirname, '../..');
const src = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('P3 adv · canonicalUrl sin barra final', () => {
  it.each([
    ['/', `${SITE_URL}/`], ['/index.html', `${SITE_URL}/`], ['/index', `${SITE_URL}/`],
    ['/aviso-legal', `${SITE_URL}/aviso-legal`], ['/aviso-legal/', `${SITE_URL}/aviso-legal`],
    ['/aviso-legal.html', `${SITE_URL}/aviso-legal`], ['/privacidad', `${SITE_URL}/privacidad`],
    ['/cookies', `${SITE_URL}/cookies`], ['/cookies.html', `${SITE_URL}/cookies`], ['/cookies/', `${SITE_URL}/cookies`],
    ['/404', `${SITE_URL}/404`],
  ])('ruta real %s -> %s', (p, want) => {
    expect(canonicalUrl(p)).toBe(want);
  });

  const WEIRD = [
    '', '//', '///', '/./', '/../', '/index/', '/a/b/../', '/a/b/../..', '/%2e%2e/', '/%2E%2E/%2e%2e/evil.com',
    '/a/./', '/x/.', '/x/..', '/aviso-legal/.', '/aviso-legal/./', '/aviso-legal//', '/cookies/./index.html',
    '/@evil.com', '/\\\\evil.com', '/\\evil.com/', '/ /', '/a/%2F/', '/.html', '?x', '#y', '/cookies?x=/', '/cookies#a/',
    'cookies', '../../evil', '/a\t/', '/a\n/', 'https://evil.com/x/', 'javascript:alert(1)', '/a//', '/.', '/..',
    '/%09/evil.com/', '/\t/evil.com', '\\/evil.com', '/:evil.com/', '/a/b/c/../../',
  ];
  it.each(WEIRD.map((w) => [w]))('entrada rara %j: dominio propio, https y sin barra final ni //', (p) => {
    const out = canonicalUrl(p);
    const u = new URL(out);
    expect(u.origin).toBe(SITE_URL);
    expect(u.search).toBe('');
    expect(u.hash).toBe('');
    expect(u.pathname).not.toMatch(/\/\//);
    if (u.pathname !== '/') expect(out).not.toMatch(/\/$/);
    expect(out.startsWith(`${SITE_URL}/`)).toBe(true);
  });
});

describe('P3 adv · CookieTable: _ga_<ID> validado y sin HTML crudo', () => {
  const s = src('src/components/CookieTable.astro');
  it('valida con la regex del plan (§4.2): ^G-[A-Z0-9]{4,15}$ y recorta', () => {
    expect(s).toContain('/^G-[A-Z0-9]{4,15}$/');
    expect(s).toMatch(/\.trim\(\)/);
  });
  it('no usa set:html ni Fragment crudo para las celdas', () => {
    expect(s).not.toMatch(/set:html|set:text/);
  });
});

describe('P3 adv · 404 y LegalLayout', () => {
  it('404.astro pasa canonical={false} a BaseLayout', () => {
    expect(src('src/pages/404.astro')).toMatch(/canonical=\{false\}/);
  });
  it('solo privacidad.astro usa la prop tight de LegalLayout', () => {
    expect(src('src/pages/privacidad.astro')).toMatch(/<LegalLayout[^>]*\btight\b/);
    for (const p of ['src/pages/aviso-legal.astro', 'src/pages/cookies.astro']) {
      expect(src(p), p).not.toMatch(/<LegalLayout[^>]*\btight\b/);
    }
  });
});

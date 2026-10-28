// Tests del adversario para P2a (canonicalUrl endurecida, datos legales, pie único).
// Regresión: no se modifican ni se borran. Cubren docs/PLAN.md §2 (A3b, A8), §3 y P2a.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_UPDATED, REGISTRO_MERCANTIL } from '../../src/lib/legal';
import { PHONE_DISPLAY, PHONE_HREF, SITE_URL, canonicalUrl } from '../../src/lib/site';

const ROOT = join(import.meta.dirname, '../..');
function srcFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.(astro|ts|mjs|js)$/.test(f) ? [p] : [];
  });
}

describe('P2a adv · canonicalUrl nunca sale de https://nandogomez.com', () => {
  const hostile = [
    '\t//evil.com', '/\t/evil.com', '/\n\n/evil.com', '\r\n//evil.com', '/\t\\evil.com',
    '//evil.com', '///evil.com', '////evil.com/x', '/\\evil.com', '\\\\evil.com', '/\\/evil.com', '\\/\\evil.com',
    '//EVIL.COM', '//Evil.Com/Index.HTML', '//evil.com:443', '//user:pw@evil.com',
    '/∕∕evil.com', '∕∕evil.com', '/／／evil.com', '／／evil.com', '＼＼evil.com',
    '/%2F%2Fevil.com', '%2F%2Fevil.com', '/%2f%2fevil.com', '/%5C%5Cevil.com', '%5c%5cevil.com', '/%09/evil.com',
    '/\u0000/evil.com', '/\f/evil.com', '/\v//evil.com', ' //evil.com', ' //evil.com', '　//evil.com',
    ' //evil.com', '﻿//evil.com', '/​/evil.com',
    'https://evil.com', 'http:evil.com', 'http:/evil.com', 'javascript:alert(1)', 'data:text/html,x', 'evil.com',
    '/@evil.com', '/..//evil.com', '/./..//evil.com', '/a/..//evil.com', '/.//evil.com', '/..\\\\evil.com',
    '?//evil.com', '#//evil.com', '', '/', '//', '\\',
  ];

  it.each(hostile)('%j', (input) => {
    const out = canonicalUrl(input);
    const u = new URL(out);
    expect(u.origin).toBe(SITE_URL);
    expect(out.startsWith(`${SITE_URL}/`)).toBe(true);
    expect(u.username).toBe('');
    expect(u.password).toBe('');
    expect(u.port).toBe('');
    expect(u.search).toBe('');
    expect(u.hash).toBe('');
    // Una URL absoluta: reinterpretada contra otro origen, sigue en nandogomez.com.
    expect(new URL(out, 'https://evil.com/').host).toBe('nandogomez.com');
  });

  it('no lanza con entradas raras (el build no debe romperse por una ruta extraña)', () => {
    for (const s of ['%', '%E0%A4%A', '/\uD800', '/' + 'a'.repeat(5000)]) expect(() => canonicalUrl(s)).not.toThrow();
  });

  it('sigue resolviendo las rutas reales de las 4 páginas', () => {
    for (const [p, want] of [
      ['/', `${SITE_URL}/`], ['/index.html', `${SITE_URL}/`],
      ['/aviso-legal.html', `${SITE_URL}/aviso-legal`], ['/privacidad.html', `${SITE_URL}/privacidad`],
      ['/cookies.html', `${SITE_URL}/cookies`],
    ] as const) expect(canonicalUrl(p)).toBe(want);
  });
});

describe('P2a adv · datos legales y contacto', () => {
  it('los pendientes de lib/legal.ts son marcadores entre corchetes, sin cifras inventadas', () => {
    for (const v of [LEGAL_UPDATED, REGISTRO_MERCANTIL]) {
      expect(v).toMatch(/^\[[^\]]+\]$/);
      expect(v).not.toMatch(/\d/);
    }
  });

  it('PHONE_HREF es tel: en E.164 y coincide dígito a dígito con PHONE_DISPLAY', () => {
    expect(PHONE_HREF).toMatch(/^tel:\+\d{8,15}$/);
    expect(PHONE_HREF.replace(/\D/g, '')).toBe(PHONE_DISPLAY.replace(/\D/g, ''));
    expect(PHONE_DISPLAY).toBe('+34 603 24 26 82');
  });
});

describe('P2a adv · pie único (A8)', () => {
  const files = srcFiles(join(ROOT, 'src'));
  const withFooter = files.filter((f) => /<footer[\s>]/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));

  it('solo src/components/Footer.astro declara <footer>', () => {
    expect(withFooter).toEqual(['src/components/Footer.astro']);
  });

  it('el único sitio que usa <Footer /> es BaseLayout (así ninguna página puede quedarse sin pie o duplicarlo)', () => {
    const users = files
      .filter((f) => /<Footer[\s/>]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(users).toEqual(['src/layouts/BaseLayout.astro']);
  });

  it('todas las páginas de src/pages usan BaseLayout directa o indirectamente', () => {
    const pagesDir = join(ROOT, 'src/pages');
    for (const f of srcFiles(pagesDir).filter((p) => p.endsWith('.astro'))) {
      expect(readFileSync(f, 'utf8'), relative(ROOT, f)).toMatch(/import\s+\w+\s+from\s+['"][./]+layouts\/(Base|Legal)Layout\.astro['"]/);
    }
  });
});

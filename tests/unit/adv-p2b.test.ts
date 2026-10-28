// Tests del adversario para P2b (/privacidad, DataBlock, campo `html` con set:html,
// canonicalUrl con barras repetidas colapsadas y main:focus global). Regresión: no se
// modifican ni se borran. Cubren docs/PLAN.md §2 (A3b, A5), §3, §5 (Teclado), §7 y §10.1.
// No asumen listas cerradas: P3–P11 añadirán páginas, componentes y estilos.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { SITE_URL, canonicalUrl } from '../../src/lib/site';

const ROOT = join(import.meta.dirname, '../..');
function files(dir: string, re: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, re) : re.test(f) ? [p] : [];
  });
}
const SRC = files(join(ROOT, 'src'), /\.(astro|ts|mjs|js)$/);
const read = (p: string): string => readFileSync(p, 'utf8');

describe('P2b adv · set:html solo recibe HTML constante y seguro', () => {
  it('ningún set:html se alimenta de props crudas, URL, params, env ni fetch', () => {
    for (const f of SRC) {
      const s = read(f);
      for (const m of s.matchAll(/set:html=\{([^}]*)\}/g)) {
        const expr = m[1]!;
        expect(expr, relative(ROOT, f)).not.toMatch(/Astro\.(url|params|request|cookies|props)|import\.meta\.env|fetch\(|searchParams/);
      }
    }
  });

  it('todo valor `html:` del código fuente es un literal de cadena sin interpolación', () => {
    for (const f of SRC) {
      const s = read(f);
      // `html?: string` no casa (lleva `?`); `html: string` de una interfaz se salta.
      for (const m of s.matchAll(/\bhtml\s*:\s*(?!string\b)(.)/g)) {
        const q = m[1]!;
        expect(['\'', '"'], `${relative(ROOT, f)}: html debe ser literal`).toContain(q);
        const rest = s.slice(m.index! + m[0].length);
        const lit = rest.slice(0, rest.indexOf(q));
        expect(lit, relative(ROOT, f)).not.toContain('${');
      }
    }
  });

  it('el HTML de cada `html:` literal solo contiene <a href> internos o https, sin estilos ni eventos', () => {
    for (const f of SRC) {
      const s = read(f);
      for (const m of s.matchAll(/\bhtml\s*:\s*(['"])((?:(?!\1).)*)\1/g)) {
        const frag = JSDOM.fragment(m[2]!);
        for (const el of frag.querySelectorAll('*')) {
          expect(el.tagName, relative(ROOT, f)).toBe('A');
          expect(el.getAttributeNames(), relative(ROOT, f)).toEqual(['href']);
          expect(el.getAttribute('href')!).toMatch(/^(\/(?!\/)|https:\/\/)/);
        }
      }
    }
  });

  it('cuando una fila lleva `html`, su `value` es el mismo texto (el fallback no diverge)', () => {
    const page = read(join(ROOT, 'src/pages/privacidad.astro'));
    const rows = [...page.matchAll(/value:\s*'([^']*)',\s*html:\s*'([^']*)'/g)];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const [, value, html] of rows) {
      expect(JSDOM.fragment(html!).textContent).toBe(value);
    }
  });
});

describe('P2b adv · canonicalUrl con barras repetidas colapsadas', () => {
  it('las rutas reales siguen dando la URL exacta (incluida /404, aunque 404 pase canonical={false})', () => {
    for (const [p, want] of [
      ['/', `${SITE_URL}/`], ['/index.html', `${SITE_URL}/`], ['/index', `${SITE_URL}/`],
      ['/aviso-legal', `${SITE_URL}/aviso-legal`], ['/aviso-legal.html', `${SITE_URL}/aviso-legal`],
      ['/aviso-legal/', `${SITE_URL}/aviso-legal`],
      ['/privacidad', `${SITE_URL}/privacidad`], ['/privacidad.html', `${SITE_URL}/privacidad`],
      ['/cookies', `${SITE_URL}/cookies`], ['/cookies.html', `${SITE_URL}/cookies`],
      ['/404', `${SITE_URL}/404`], ['/404.html', `${SITE_URL}/404`],
    ] as const) expect(canonicalUrl(p)).toBe(want);
  });

  const hostile = [
    '/%2e%2e//evil.com', '/.%2e//evil.com', '/%2E%2E//evil.com', '/a/%2e%2e//evil.com', '/../..//evil.com',
    '/..///evil.com', '/a/b/../..//evil.com', '//evil.com/..//x', '/..//evil.com:8080/x', '/..//user@evil.com',
    '/..//\tevil.com', '/..\\/evil.com', '/..%5C%5Cevil.com', '/././/evil.com', '/a/../../..//evil.com/index.html',
  ];
  it.each(hostile)('%j sigue en nandogomez.com y sin `//` en la ruta', (input) => {
    const out = canonicalUrl(input);
    const u = new URL(out);
    expect(u.origin).toBe(SITE_URL);
    expect(u.pathname).not.toMatch(/\/\//);
    expect(u.username + u.password + u.port + u.search + u.hash).toBe('');
    expect(new URL(out, 'https://evil.com/').host).toBe('nandogomez.com');
  });

  it('el colapso no toca barras codificadas (%2F): siguen siendo un único segmento local', () => {
    const out = canonicalUrl('/%2F%2Fevil.com');
    expect(new URL(out).host).toBe('nandogomez.com');
    expect(out.startsWith(`${SITE_URL}/`)).toBe(true);
  });
});

describe('P2b adv · main:focus global sin quitar el foco de nada más', () => {
  // Todas las reglas CSS del código fuente (global.css, tokens.css y <style> de componentes).
  const css = SRC.concat(files(join(ROOT, 'src'), /\.css$/))
    .flatMap((f) => {
      const s = read(f);
      return f.endsWith('.css') ? [s] : [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
    })
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('cualquier regla que anula el contorno (outline none/0/transparent) es exactamente `main:focus`', () => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/outline\s*:\s*(none|0(px)?|transparent)\b|outline-(style|width)\s*:\s*(none|0)/.test(m[2]!)) continue;
      expect(m[1]!.trim()).toBe('main:focus');
    }
  });

  it(':focus-visible global conserva el contorno de 2px en --ink', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline\s*:\s*2px solid var\(--ink\)/);
  });
});

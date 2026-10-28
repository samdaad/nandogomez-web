// Tests del adversario para P1 (tokens, fuentes, BaseLayout, canonical). Regresión: no se
// modifican ni se borran. Cubren docs/PLAN.md §2 (A3b, A9, A10), §3 (tokens, fuentes,
// canonicalUrl) y §5 (Teclado). No asumen listas cerradas: P2–P11 pueden añadir tokens
// locales, componentes y estilos siempre que no rompan lo que P1 fija.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_URL, THEME_COLOR, canonicalUrl } from '../../src/lib/site';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

type Token = { name: string; value: string };
const json = JSON.parse(read('design/tokens.json')) as Record<string, { tokens?: Token[] }>;
const jsonTokens: Token[] = Object.values(json).flatMap((g) => (Array.isArray(g?.tokens) ? g.tokens : []));
const tokensCss = stripComments(read('src/styles/tokens.css'));
const globalCss = stripComments(read('src/styles/global.css'));

/** Todas las declaraciones `--x: valor;` de un CSS, en orden. */
const decls = (css: string): { name: string; value: string }[] =>
  [...css.matchAll(/(?<![\w-])--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1] ?? '', value: (m[2] ?? '').trim() }));

function srcFiles(dir: string, re: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p, re) : re.test(f) ? [p] : [];
  });
}

describe('P1 adv · tokens.css frente a design/tokens.json', () => {
  it('tokens.json se lee por grupos genéricos y siguen siendo 24 (10 color, 7 spacing, 5 radius, 2 size)', () => {
    expect(jsonTokens).toHaveLength(24);
    expect(new Set(jsonTokens.map((t) => t.name)).size).toBe(24);
  });

  it('cada token de tokens.json se declara UNA sola vez (un duplicado posterior pisaría el valor bueno)', () => {
    const all = decls(tokensCss);
    for (const { name } of jsonTokens) {
      expect(all.filter((d) => d.name === name).length, `--${name}`).toBe(1);
    }
  });

  it('el valor de cada token coincide exactamente (comparación anclada, sin coincidencias parciales de nombre)', () => {
    const map = new Map(decls(tokensCss).map((d) => [d.name, d.value]));
    for (const { name, value } of jsonTokens) {
      const ref = /^\{([\w-]+)\}$/.exec(value);
      const expected = ref ? `var(--${ref[1]})` : value;
      expect(map.get(name)?.toLowerCase(), `--${name}`).toBe(expected.toLowerCase());
    }
  });

  it('on-lime resuelve al mismo color que bg (referencia, no copia del hex)', () => {
    const map = new Map(decls(tokensCss).map((d) => [d.name, d.value]));
    expect(map.get('on-lime')).toBe('var(--bg)');
  });

  it('tokens.css solo contiene un bloque :root (sin @media ni selectores que redefinan tokens en otro contexto)', () => {
    const blocks = [...tokensCss.matchAll(/([^{}]+)\{/g)].map((m) => (m[1] ?? '').trim());
    expect(blocks).toEqual([':root']);
  });

  it('ningún otro CSS/astro de src/ redefine un token de tokens.json', () => {
    const names = new Set(jsonTokens.map((t) => t.name));
    const offenders = srcFiles(join(ROOT, 'src'), /\.(css|astro)$/)
      .filter((f) => relative(ROOT, f) !== 'src/styles/tokens.css')
      .flatMap((f) =>
        decls(stripComments(readFileSync(f, 'utf8')))
          .filter((d) => names.has(d.name))
          .map((d) => `${relative(ROOT, f)}: --${d.name}`),
      );
    expect(offenders).toEqual([]);
  });

  it('todo var(--x) usado en src/ está definido en algún CSS de src/ (sin erratas de nombre)', () => {
    const files = srcFiles(join(ROOT, 'src'), /\.(css|astro)$/);
    const defined = new Set(files.flatMap((f) => decls(stripComments(readFileSync(f, 'utf8'))).map((d) => d.name)));
    const missing = files.flatMap((f) =>
      [...stripComments(readFileSync(f, 'utf8')).matchAll(/var\(\s*--([\w-]+)/g)]
        .map((m) => m[1] ?? '')
        .filter((n) => !defined.has(n))
        .map((n) => `${relative(ROOT, f)}: --${n}`),
    );
    expect(missing).toEqual([]);
  });

  it('THEME_COLOR es un hex de 6 dígitos igual a bg de tokens.json (no solo a tokens.css)', () => {
    const bg = jsonTokens.find((t) => t.name === 'bg')?.value;
    expect(THEME_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLOR.toLowerCase()).toBe(bg?.toLowerCase());
  });
});

describe('P1 adv · @font-face en global.css (A9, §3)', () => {
  const faces = [...globalCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
  const prop = (face: string, p: string): string | undefined =>
    new RegExp(`(?:^|;|\\s)${p}\\s*:\\s*([^;]+)`).exec(face)?.[1]?.trim();

  it('cubre al menos Geist 400/500/600/700 y Geist Mono 400/500, normal', () => {
    const have = new Set(faces.map((f) => `${prop(f, 'font-family')?.replace(/["']/g, '')}|${prop(f, 'font-weight')}|${prop(f, 'font-style')}`));
    for (const w of ['400', '500', '600', '700']) expect(have, `Geist ${w}`).toContain(`Geist|${w}|normal`);
    for (const w of ['400', '500']) expect(have, `Geist Mono ${w}`).toContain(`Geist Mono|${w}|normal`);
  });

  it('cada @font-face: font-display swap y TODAS sus url() son woff2 latin locales que existen en node_modules', () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(prop(face, 'font-display'), face).toBe('swap');
      const urls = [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1] ?? '');
      expect(urls.length, face).toBeGreaterThan(0);
      for (const u of urls) {
        expect(u, 'sin http(s), sin //, sin data:').not.toMatch(/^(?:[a-z]+:|\/\/)/i);
        expect(u).toMatch(/-latin-\d{3}-normal\.woff2$/);
        expect(existsSync(join(ROOT, 'src/styles', u)), u).toBe(true);
      }
    }
  });

  it('global.css no importa los CSS de @fontsource (traerían .woff y todos los subconjuntos)', () => {
    expect(globalCss).not.toMatch(/@import\s+(?:url\()?["']?@fontsource/);
    expect(globalCss).not.toMatch(/@import\s+(?:url\()?["']?(?:https?:)?\/\//);
  });
});

describe('P1 adv · :focus-visible (§5 Teclado: «contorno de 2px en --ink»)', () => {
  it('la regla global :focus-visible usa outline 2px con var(--ink)', () => {
    const rules = [...globalCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === ':focus-visible'))
      .map((m) => m[2] ?? '');
    expect(rules.length).toBeGreaterThan(0);
    const outline = rules.join(';').match(/outline\s*:\s*([^;]+)/)?.[1] ?? '';
    expect(outline).toMatch(/\b2px\b/);
    expect(outline).toMatch(/var\(--ink\)/);
  });
});

describe('P1 adv · canonicalUrl con entradas límite alcanzables', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/index', '/'],
    ['/index.html', '/'],
    ['//', '/'],
    ['/a/b.html', '/a/b'],
    ['/a/b/', '/a/b'],
    ['/a/index.html', '/a'],
    ['/privacidad.html', '/privacidad'],
    ['/cookies', '/cookies'],
    ['/404.html', '/404'],
  ])('%s -> SITE_URL + %s', (input, path) => {
    expect(canonicalUrl(input)).toBe(new URL(path, SITE_URL).href);
  });

  it('para las rutas de §2 A3 el resultado es del origen canónico, https, sin .html, sin index y sin barra final salvo la raíz', () => {
    for (const p of ['/', '/index.html', '/aviso-legal.html', '/privacidad.html', '/cookies.html']) {
      const u = new URL(canonicalUrl(p));
      expect(u.origin).toBe(SITE_URL);
      expect(u.search + u.hash).toBe('');
      expect(u.pathname).not.toMatch(/\.html$|\/index$/);
      if (u.pathname !== '/') expect(u.pathname).not.toMatch(/\/$/);
    }
  });

  it('es idempotente sobre su propia salida (pathname)', () => {
    for (const p of ['/', '/aviso-legal.html', '/a/index.html', '/a/b/']) {
      const once = canonicalUrl(p);
      expect(canonicalUrl(new URL(once).pathname)).toBe(once);
    }
  });
});

describe('P1 adv · .gitignore', () => {
  const ignored = (p: string): boolean =>
    spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: ROOT }).status === 0;

  it('tests/dist/** NO está ignorado (la regla `dist` sin barra lo atraparía)', () => {
    expect(ignored('tests/dist/base.test.ts')).toBe(false);
    expect(ignored('tests/dist/helpers.ts')).toBe(false);
    expect(ignored('tests/dist/nuevo/futuro.test.ts')).toBe(false);
  });

  it('dist/ y dist-e2e/ de la raíz siguen ignorados', () => {
    expect(ignored('dist/index.html')).toBe(true);
    expect(ignored('dist-e2e/index.html')).toBe(true);
  });
});

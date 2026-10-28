// Tests del adversario para P1 sobre dist/ y sobre el propio arnés. Regresión: no se
// modifican ni se borran. Cubren A3b (canonical), A4, A5, A6, A9 y la CSP de §7 (nada en
// línea, nada externo). No asumen listas cerradas de páginas: se aplican a todo dist/**.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DIST, distFiles, pages, read } from './helpers';

const ROOT = join(import.meta.dirname, '../..');
const SITE = 'https://nandogomez.com';
const all = pages();
const css = distFiles().filter((f) => f.endsWith('.css'));

/** Recurso local: ruta absoluta del mismo origen (no `//host`) o relativa sin esquema. */
const isLocal = (u: string): boolean => !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(u.trim());

describe('P1 adv · dist no carga nada externo (CSP §7: default-src/style-src/font-src \'self\')', () => {
  it('hay páginas que revisar', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  describe.each(all)('$file', ({ doc, html }) => {
    it('<link>: solo canonical/alternate pueden ser absolutos, y solo hacia el origen canónico', () => {
      for (const l of doc.querySelectorAll('link[href]')) {
        const href = l.getAttribute('href') ?? '';
        const rel = (l.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
        if (rel.includes('canonical') || rel.includes('alternate')) {
          expect(new URL(href).origin, href).toBe(SITE);
        } else {
          expect(isLocal(href), `${rel.join(' ')} → ${href}`).toBe(true);
        }
      }
    });

    it('sin preconnect / dns-prefetch / preload hacia otros hosts', () => {
      const bad = [...doc.querySelectorAll('link[rel~=preconnect], link[rel~=dns-prefetch], link[rel~=preload], link[rel~=modulepreload]')]
        .map((l) => l.getAttribute('href') ?? '')
        .filter((h) => !isLocal(h));
      expect(bad).toEqual([]);
    });

    it('src/srcset/data/poster/action de recursos embebidos son locales', () => {
      const bad: string[] = [];
      for (const el of doc.querySelectorAll('script[src], img, source, iframe, embed, object, video, audio, track, input[type=image], form[action]')) {
        for (const a of ['src', 'data', 'poster', 'action']) {
          const v = el.getAttribute(a);
          if (v !== null && !isLocal(v)) bad.push(`${el.tagName} ${a}=${v}`);
        }
        for (const a of ['srcset', 'imagesrcset']) {
          for (const part of (el.getAttribute(a) ?? '').split(',')) {
            const u = part.trim().split(/\s+/)[0];
            if (u && !isLocal(u)) bad.push(`${el.tagName} ${a}=${u}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });

    it('sin <base>, sin meta refresh y sin URLs javascript: (las bloquea una CSP sin unsafe-inline)', () => {
      expect(doc.querySelectorAll('base')).toHaveLength(0);
      expect(doc.querySelectorAll('meta[http-equiv="refresh" i]')).toHaveLength(0);
      const js = [...doc.querySelectorAll('[href], [src], [action], [formaction]')].filter((e) =>
        ['href', 'src', 'action', 'formaction'].some((a) => /^\s*javascript:/i.test(e.getAttribute(a) ?? '')),
      );
      expect(js).toHaveLength(0);
    });

    it('sin <meta http-equiv=Content-Security-Policy> (la CSP va en _headers, §7 y «APIs leídas»)', () => {
      expect(doc.querySelectorAll('meta[http-equiv="content-security-policy" i]')).toHaveLength(0);
    });

    it('A5 reforzado: tampoco <style> dentro de SVG ni <script> con src vacío', () => {
      expect(doc.querySelectorAll('svg style')).toHaveLength(0);
      expect([...doc.querySelectorAll('script')].filter((s) => (s.getAttribute('src') ?? '').trim() === '')).toHaveLength(0);
      expect(html).not.toMatch(/<style[\s>]/i);
    });

    it('A3b: como mucho un canonical; si hay og:url, coincide con el canonical', () => {
      const canon = doc.querySelectorAll('link[rel=canonical]');
      expect(canon.length).toBeLessThanOrEqual(1);
      const og = doc.querySelector('meta[property="og:url"]')?.getAttribute('content');
      if (og !== undefined && og !== null) expect(og).toBe(canon[0]?.getAttribute('href'));
      const href = canon[0]?.getAttribute('href');
      if (href) {
        const u = new URL(href);
        expect(u.origin).toBe(SITE);
        expect(u.pathname).not.toMatch(/\.html$|\/index$/);
        if (u.pathname !== '/') expect(u.pathname).not.toMatch(/\/$/);
        expect(u.search + u.hash).toBe('');
      }
    });
  });

  it('los CSS de dist: sin @import y todas las url() son locales y sin data: (img-src/font-src \'self\')', () => {
    expect(css.length).toBeGreaterThan(0);
    for (const f of css) {
      const text = read(f);
      expect(text, f).not.toMatch(/@import/);
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        const u = m[1] ?? '';
        expect(isLocal(u), `${f}: ${u}`).toBe(true);
      }
    }
  });

  it('A9: cada url() de cada @font-face apunta a un .woff2 que EXISTE en dist/', () => {
    const faces = css.flatMap((f) => read(f).match(/@font-face\s*\{[^}]*\}/g) ?? []);
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      const urls = [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1] ?? '');
      expect(urls.length, face).toBeGreaterThan(0);
      for (const u of urls) {
        expect(u, face).toMatch(/^\/_astro\/[^/]+\.woff2$/);
        expect(existsSync(join(DIST, u)), u).toBe(true);
      }
    }
  });

  it('A9: ningún HTML enlaza fuentes directamente desde otro host ni con .woff/.ttf/.otf', () => {
    for (const { file, html } of all) expect(html, file).not.toMatch(/\.(?:woff|ttf|otf|eot)\b(?!2)/i);
  });
});

describe('P1 adv · skip link (§3 BaseLayout, §5 «Hay skip link»)', () => {
  const withMain = all.filter(({ doc }) => doc.querySelector('main'));

  it.each(withMain)('$file: el primer elemento enfocable es el skip link a #main, y #main existe', ({ doc }) => {
    const first = doc.querySelector('body a[href], body button, body input, body select, body textarea, body [tabindex]');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(doc.getElementById('main')?.tagName).toBe('MAIN');
  });

  it('el skip link se hace visible al recibir el foco (si no, el foco es invisible: WCAG 2.4.7)', () => {
    const home = all.find((p) => p.file.endsWith('dist/index.html'));
    const link = home?.doc.querySelector('a[href="#main"]');
    expect(link).toBeTruthy();
    const classes = [...(link?.classList ?? [])];
    const cssText = css.map(read).join('\n');
    // Debe existir una regla que trate el foco de esa clase: `.x:focus`, `.x:focus-visible`,
    // `.x:not(:focus)`, `.x:not(:focus-within)`… Sin ella, el enlace queda recortado a 1×1 px.
    const selectors = [...cssText.matchAll(/([^{}]+)\{/g)].flatMap((m) => (m[1] ?? '').split(','));
    const handlesFocus = selectors.some((s) =>
      classes.some((c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])[^\\s>+~]*:(?:not\\(\\s*:)?focus`).test(s)),
    );
    expect(handlesFocus, `clases del skip link: ${classes.join(' ')}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// El arnés detecta lo que dice: se ejecuta tests/dist/base.test.ts contra un dist trampa.
// ---------------------------------------------------------------------------------------
type Assertion = { ancestorTitles: string[]; title: string; status: string };

describe('P1 adv · el arnés de dist (base.test.ts) detecta de verdad cada violación', () => {
  let box = '';
  let results: Assertion[] = [];
  const page = (body: string, head = ''): string =>
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>t</title>${head}</head><body><main id="main"><h1>T</h1>${body}</main></body></html>`;

  // Nombres cortos: vitest trunca a 40 caracteres el título de describe.each('$file').
  const TRAPS: Record<string, string> = {
    'a4-1.html': page('', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist">'),
    'a4-2.html': page('', '<link rel="preload" href="https://fonts.gstatic.com/x.woff2" as="font">'),
    'a4-3.html': page('<img src="/_blob/abc" alt="">'),
    'a4-4.html': page('<script src="/support.js"></script>'),
    'a4-5.html': page('<div data-x="DCLogic"></div>'),
    'a4-6.html': page('<div data-props="{}"></div>'),
    'a4-7.html': page('<p>{{ nombre }}</p>'),
    'a4-8.html': page('<x-dc></x-dc>'),
    'a5-1.html': page('<script>1</script>'),
    'a5-2.html': page('', '<style>p{}</style>'),
    'a5-3.html': page('<p style="color:red">x</p>'),
    'a5-4.html': page('<img src="/x.png" alt="" onerror="1">'),
    'a5-5.html': page('<svg><style>p{}</style></svg>'),
    'a5-6.html': page('', '<script type="application/ld+json">{}</script>'),
    'a6-1.html': page('<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>'),
    'a6-2.html': page('<img src="https://region1.google-analytics.com/g/collect" alt="">'),
    'ln-1.html': page('').replace('lang="es"', 'lang="en"'),
    'h1-2.html': page('<h1>Otro</h1>'),
  };

  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'p1-'));
    mkdirSync(join(box, 'tests/dist'), { recursive: true });
    mkdirSync(join(box, 'dist/_astro'), { recursive: true });
    for (const f of ['base.test.ts', 'helpers.ts']) copyFileSync(join(ROOT, 'tests/dist', f), join(box, 'tests/dist', f));
    copyFileSync(join(ROOT, 'vitest.dist.config.ts'), join(box, 'vitest.dist.config.ts'));
    writeFileSync(join(box, 'package.json'), '{"type":"module","private":true}');
    symlinkSync(join(ROOT, 'node_modules'), join(box, 'node_modules'), 'dir');
    // Home trampa: canonical con .html, sin hoja de estilos, theme-color distinto.
    writeFileSync(
      join(box, 'dist/index.html'),
      page('', '<link rel="canonical" href="https://nandogomez.com/index.html"><meta name="theme-color" content="#ffffff">'),
    );
    for (const [f, html] of Object.entries(TRAPS)) writeFileSync(join(box, 'dist', f), html);
    writeFileSync(
      join(box, 'dist/_astro/trap.css'),
      '@font-face{font-family:X;src:url(https://fonts.gstatic.com/x.woff2)format("woff2")}' +
        '@font-face{font-family:Y;src:url(/_astro/y.woff)format("woff")}.a[data-props]{}',
    );
    writeFileSync(join(box, 'dist/_astro/y.woff'), '');
    const out = join(box, 'out.json');
    spawnSync(
      join(ROOT, 'node_modules/.bin/vitest'),
      ['run', '-c', 'vitest.dist.config.ts', '--reporter=json', `--outputFile=${out}`, 'tests/dist/base.test.ts'],
      { cwd: box, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CI: '1' } },
    );
    const report = JSON.parse(readFileSync(out, 'utf8')) as { testResults: { assertionResults: Assertion[] }[] };
    results = report.testResults.flatMap((t) => t.assertionResults);
  });

  afterAll(() => {
    if (box) rmSync(box, { recursive: true, force: true });
  });

  const statusFor = (file: string, title: RegExp): string[] =>
    results.filter((r) => r.ancestorTitles.some((a) => a.endsWith(`/dist/${file}`)) && title.test(r.title)).map((r) => r.status);

  it('el arnés trampa se ejecutó y produjo resultados con títulos sin truncar', () => {
    expect(results.length).toBeGreaterThan(Object.keys(TRAPS).length);
    const truncated = results.flatMap((r) => r.ancestorTitles).filter((a) => a.endsWith('…'));
    expect(truncated, 'TMPDIR demasiado largo para identificar las páginas trampa').toEqual([]);
  });

  it.each(Object.keys(TRAPS).filter((f) => f.startsWith('a4-')))('A4 detecta %s', (f) => {
    expect(statusFor(f, /^A4/)).toEqual(['failed']);
  });

  it.each(Object.keys(TRAPS).filter((f) => f.startsWith('a5-')))('A5 detecta %s', (f) => {
    expect(statusFor(f, /^A5/)).toEqual(['failed']);
  });

  it.each(Object.keys(TRAPS).filter((f) => f.startsWith('a6-')))('A6 detecta %s', (f) => {
    expect(statusFor(f, /^A6/)).toEqual(['failed']);
  });

  it('lang y h1: detecta lang="en" y dos h1, y no da falsos positivos en una página limpia', () => {
    expect(statusFor('ln-1.html', /lang/)).toEqual(['failed']);
    expect(statusFor('h1-2.html', /lang/)).toEqual(['failed']);
    expect(statusFor('a4-5.html', /lang/)).toEqual(['passed']);
    expect(statusFor('a4-5.html', /^A5/)).toEqual(['passed']);
  });

  it('home: detecta canonical con .html y theme-color/hoja de estilos ausentes', () => {
    const top = (t: RegExp): string[] => results.filter((r) => r.ancestorTitles.length === 1 && t.test(r.title)).map((r) => r.status);
    expect(top(/canonical/)).toEqual(['failed']);
    expect(top(/hoja de estilos/)).toEqual(['failed']);
  });

  it('A9/A4 CSS: detecta URL externa en @font-face, restos en CSS y ficheros .woff', () => {
    const a9 = (t: RegExp): string[] => results.filter((r) => r.ancestorTitles.includes('A9 · fuentes propias') && t.test(r.title)).map((r) => r.status);
    expect(a9(/restos/)).toEqual(['failed']);
    expect(a9(/@font-face/)).toEqual(['failed']);
    expect(a9(/^no hay ficheros \.woff/)).toEqual(['failed']);
  });

  it('sin dist/ el arnés falla (no pasa en vacío)', () => {
    rmSync(join(box, 'dist'), { recursive: true, force: true });
    const r = spawnSync(join(ROOT, 'node_modules/.bin/vitest'), ['run', '-c', 'vitest.dist.config.ts', 'tests/dist/base.test.ts'], {
      cwd: box,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });
    expect(r.status).not.toBe(0);
  });
});

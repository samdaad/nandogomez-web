// Tests del adversario para P3 (/cookies, 404, comprobador de enlaces A7, margen tight).
// Regresión: no se modifican ni se borran. Cubren docs/PLAN.md §2 (A3, A3b, A7, A8), §3,
// §4.4, §5 (sin JS, teclado, PUBLIC_GA_ID inválido, rutas), §10.1 y P3, comparando con
// design/Cookies.dc.html. No asumen listas cerradas de páginas: P4–P11 añadirán más.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DIST, pages, walk } from './helpers';
import { brokenLinks } from './links';

const ROOT = join(import.meta.dirname, '../..');
const all = pages().map((p) => ({ ...p, rel: relative(DIST, p.file) }));
const byRel = (rel: string) => all.find((p) => p.rel === rel);
const cookies = byRel('cookies.html');
const nf = byRel('404.html');
const design = new JSDOM(readFileSync(join(ROOT, 'design/Cookies.dc.html'), 'utf8')).window.document;
const plan = readFileSync(join(ROOT, 'docs/PLAN.md'), 'utf8');
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const flat = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '');

const S101_TRAS_TABLA = plan.match(/\*Cookies, tras la tabla:\*\s*«([^»]+)»/)?.[1];
const S101_DURACION = plan.match(/\*Columna «Duración» de `_ga` y `_ga_…`:\*\s*«([^»]+)»/)?.[1];

const ids = new Map(all.map((p) => [p.file, new Set([...p.doc.querySelectorAll('[id]')].map((e) => e.id))]));
const idsOf = (f: string): Set<string> => ids.get(f) ?? new Set();
const docOf = (body: string): Document => new JSDOM(`<!DOCTYPE html><body>${body}</body>`).window.document;

// ---------------------------------------------------------------------------------------
describe('P3 adv · /cookies frente al diseño y §10.1', () => {
  it('§10.1 (párrafo tras la tabla y duración) se encuentra en el plan', () => {
    expect(S101_TRAS_TABLA).toMatch(/^La duración indica/);
    expect(S101_DURACION).toBe('2 años (en tu navegador)');
  });

  it('el texto de <main> es el del diseño + §10.1 (duraciones y párrafo tras la tabla) + <noscript>', () => {
    expect(cookies).toBeDefined();
    const d = design.cloneNode(true) as Document;
    const main = d.querySelector('main')!;
    const rows = [...main.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    rows.slice(1).forEach((r) => {
      const td = r.querySelectorAll('td')[4]!;
      expect(norm(td.textContent)).toBe('2 años');
      td.textContent = S101_DURACION!;
    });
    const wrap = main.querySelector('table')!.parentElement!;
    const p = d.createElement('p');
    p.textContent = S101_TRAS_TABLA!;
    wrap.after(p);
    const ns = cookies!.doc.querySelector('main noscript');
    const btn = [...main.querySelectorAll('a')].find((a) => norm(a.textContent) === 'Configurar cookies')!;
    btn.before(d.createTextNode(ns?.textContent ?? ''));
    expect(flat(cookies!.doc.querySelector('main')?.textContent)).toBe(flat(main.textContent));
  });

  it('el párrafo «Las tipografías…» del diseño no contradice §10.1: no hay «14 meses» ni «2 años» sin «(en tu navegador)»', () => {
    const t = norm(cookies!.doc.querySelector('main')?.textContent);
    expect(t).not.toMatch(/14 meses/);
    const dosAnos = [...t.matchAll(/2 años(.{0,20})/g)].map((m) => m[1]);
    expect(dosAnos.length).toBeGreaterThanOrEqual(2);
    dosAnos.forEach((rest) => expect(rest).toMatch(/^ \(en tu navegador\)/));
  });

  it('la tabla: 5 th scope=col en thead, ningún th sin scope, 3 filas y cada fila con 5 celdas', () => {
    const t = cookies!.doc.querySelector('main table')!;
    t.querySelectorAll('th').forEach((h) => expect(h.getAttribute('scope')).toMatch(/^(col|row)$/));
    expect(t.querySelectorAll('thead th[scope=col]')).toHaveLength(5);
    const rows = [...t.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r.querySelectorAll('td, th')).toHaveLength(5));
    const cell = (i: number, j: number) => norm(rows[i]!.querySelectorAll('td, th')[j]?.textContent);
    expect([cell(0, 0), cell(0, 2), cell(0, 4)]).toEqual(['ng_consent', 'Técnica', '12 meses']);
    expect([cell(1, 0), cell(1, 1), cell(1, 2), cell(1, 4)]).toEqual(['_ga', 'Google', 'Analítica', S101_DURACION]);
    expect([cell(2, 1), cell(2, 2), cell(2, 4)]).toEqual(['Google', 'Analítica', S101_DURACION]);
  });

  it('región desplazable: única, role=region con nombre, tabindex=0, contiene la tabla y su CSS da overflow-x', () => {
    const regions = [...cookies!.doc.querySelectorAll('main [role=region]')];
    expect(regions).toHaveLength(1);
    const r = regions[0]!;
    expect(r.querySelector('table')).not.toBeNull();
    expect(r.getAttribute('tabindex')).toBe('0');
    const name = norm(r.getAttribute('aria-label')) || norm(
      (r.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => cookies!.doc.getElementById(id)?.textContent).join(' '),
    );
    expect(name.length).toBeGreaterThan(3);
    const cls = [...r.classList];
    expect(cls.length).toBeGreaterThan(0);
    const css = cookies!.doc.querySelectorAll('link[rel=stylesheet]');
    const text = [...css].map((l) => readFileSync(join(DIST, l.getAttribute('href')!), 'utf8')).join('\n');
    const rule = cls.some((c) => new RegExp(`\\.${c}(\\[[^\\]]+\\])?\\{[^}]*overflow(-x)?:auto`).test(text));
    expect(rule, 'la región no tiene overflow-x:auto en su CSS').toBe(true);
  });

  it('#configurar: id único en la página, sección con su h2, <noscript> útil y enlace sin JS a /cookies#configurar', () => {
    const d = cookies!.doc;
    expect(d.querySelectorAll('#configurar')).toHaveLength(1);
    const sec = d.getElementById('configurar')!;
    expect(sec.closest('main')).not.toBeNull();
    const ns = sec.querySelector('noscript')!;
    expect(norm(ns.textContent)).toMatch(/JavaScript/);
    expect(norm(ns.textContent)).toMatch(/analítica/);
    expect(ns.querySelector('script, [style], a[href^="javascript:"]')).toBeNull();
    const links = [...d.querySelectorAll('[data-consent-open]')];
    expect(links.length).toBeGreaterThanOrEqual(2); // botón de #configurar + pie (A8)
    links.forEach((a) => {
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toBe('/cookies#configurar');
    });
  });

  it('[data-consent-open] de TODAS las páginas apunta a /cookies#configurar, que existe (sin JS)', () => {
    const target = cookies!.file;
    expect(idsOf(target).has('configurar')).toBe(true);
    for (const p of all) {
      const ls = [...p.doc.querySelectorAll('[data-consent-open]')];
      expect(ls.length, p.rel).toBeGreaterThan(0);
      ls.forEach((a) => expect(a.getAttribute('href'), p.rel).toBe('/cookies#configurar'));
    }
  });

  it('ningún enlace interno de /cookies apunta a ficheros del diseño ni con .html', () => {
    const hrefs = [...cookies!.doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!);
    hrefs.filter((h) => h.startsWith('/')).forEach((h) => expect(h).not.toMatch(/\.html(#|\?|$)/));
    expect(cookies!.html).not.toMatch(/\.dc\.html|BannerCookies/);
  });
});

// ---------------------------------------------------------------------------------------
describe('P3 adv · 404', () => {
  it('es dist/404.html en la raíz (Cloudflare Pages la sirve como 404) y no hay 404/index.html', () => {
    expect(existsSync(join(DIST, '404.html'))).toBe(true);
    expect(existsSync(join(DIST, '404/index.html'))).toBe(false);
  });

  it('sin canonical ni og:url, un h1, enlace a /, main#main para el skip link', () => {
    const d = nf!.doc;
    expect(d.querySelector('link[rel=canonical], meta[property="og:url"]')).toBeNull();
    expect(d.querySelectorAll('h1')).toHaveLength(1);
    expect(d.querySelector('main a[href="/"]')).not.toBeNull();
    expect(d.querySelector('main#main')).not.toBeNull();
  });

  it('todas sus referencias son absolutas o anclas: se sirve en cualquier profundidad (/a/b/c)', () => {
    const refs = [...nf!.doc.querySelectorAll('[href], [src]')].map((e) => e.getAttribute('href') ?? e.getAttribute('src')!);
    expect(refs.length).toBeGreaterThan(0);
    refs.forEach((r) => expect(r).toMatch(/^(\/(?!\/)|#|mailto:|tel:|https:\/\/)/));
  });
});

// ---------------------------------------------------------------------------------------
describe('P3 adv · comprobador A7 (brokenLinks) contra el dist real', () => {
  const check = (from: string, body: string) => brokenLinks(from, docOf(body), idsOf);

  it('sin falsos positivos: mailto, tel, https, //, #main, #configurar, /, rutas reales, relativas válidas y query', () => {
    expect(check('/privacidad', [
      '<a href="mailto:hola@nandogomez.com">m</a>', '<a href="tel:+34603242682">t</a>',
      '<a href="https://www.linkedin.com/in/x">l</a>', '<a href="//cdn.example/x">p</a>',
      '<a href="#main">s</a>', '<a href="/cookies#configurar">c</a>', '<a href="/">h</a>',
      '<a href="/aviso-legal">a</a>', '<a href="cookies">rel</a>', '<a href="./cookies#configurar">rel2</a>',
      '<a href="/cookies?utm=x#configurar">q</a>', '<a href="/#main">hm</a>',
    ].join(''))).toEqual([]);
  });

  it.each([
    ['/no-existe'], ['/cookies#nada'], ['#nada'], ['/Cookies'], ['/COOKIES#configurar'], ['/cookies/'],
    ['cookies/'], ['../no-existe'], ['/cookies#Configurar'], ['/_astro/no.css'], ['/_astro'], ['/aviso-legal/index'],
  ])('detecta %s como roto', (href) => {
    expect(check('/privacidad', `<a href="${href}">x</a>`)).toEqual([href]);
  });

  it('detecta src roto (img/script) y no confunde una hoja real', () => {
    const css = nf!.doc.querySelector('link[rel=stylesheet]')!.getAttribute('href')!;
    expect(check('/', `<img src="/x.webp" alt=""><script src="/no.js"></script><link rel="stylesheet" href="${css}">`))
      .toEqual(['/x.webp', '/no.js']);
  });

  // BLOQUEANTE: fileFor() decodifica %2f y hace join(DIST, ...) sin comprobar que el fichero
  // quede dentro de dist/: `/..%2fpackage.json` «resuelve» al package.json del repo, pero
  // en Cloudflare es un 404.
  it.each([['/..%2fpackage.json'], ['/..%2fsrc%2fpages%2fcookies.astro'], ['/x%2f..%2f..%2fdocs%2fPLAN.md']])(
    'no sale de dist/: %s es un enlace roto',
    (href) => {
      expect(check('/privacidad', `<a href="${href}">x</a>`)).toEqual([href]);
    },
  );

  // BLOQUEANTE: una referencia que parece interna pero el navegador resuelve a otro host
  // (`/\evil.com`) se da por buena porque se compara solo el pathname ("/" → index.html).
  it.each([['/\\evil.example/'], ['/\\\\evil.example'], ['\\\\evil.example/cookies']])(
    'no da por interna una referencia que sale a otro host: %s',
    (href) => {
      expect(check('/privacidad', `<a href="${href}">x</a>`)).toEqual([href]);
    },
  );
});

// ---------------------------------------------------------------------------------------
type Assertion = { ancestorTitles: string[]; title: string; status: string };

describe('P3 adv · links.test.ts falla de verdad sobre un dist trampa', () => {
  let box = '';
  let results: Assertion[] = [];
  const page = (body: string): string =>
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body><main id="main"><h1>T</h1>${body}</main></body></html>`;
  const TRAPS: Record<string, string> = {
    'ok.html': page('<a href="#main">s</a><a href="mailto:a@b.c">m</a><a href="tel:+341">t</a><a href="https://x.y/">e</a><a href="/">h</a><a href="/ok">o</a>'),
    'r1.html': page('<a href="/nada">x</a>'),
    'r2.html': page('<a href="/ok#nada">x</a>'),
    'r3.html': page('<a href="#nada">x</a>'),
    'r4.html': page('<a href="/OK">x</a>'),
    'r5.html': page('<img src="/_astro/no.webp" alt="">'),
  };

  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'p3-'));
    mkdirSync(join(box, 'tests/dist'), { recursive: true });
    mkdirSync(join(box, 'dist'), { recursive: true });
    for (const f of ['links.test.ts', 'links.ts', 'helpers.ts']) copyFileSync(join(ROOT, 'tests/dist', f), join(box, 'tests/dist', f));
    copyFileSync(join(ROOT, 'vitest.dist.config.ts'), join(box, 'vitest.dist.config.ts'));
    writeFileSync(join(box, 'package.json'), '{"type":"module","private":true}');
    symlinkSync(join(ROOT, 'node_modules'), join(box, 'node_modules'), 'dir');
    writeFileSync(join(box, 'dist/index.html'), page(''));
    for (const [f, html] of Object.entries(TRAPS)) writeFileSync(join(box, 'dist', f), html);
    const out = join(box, 'out.json');
    spawnSync(
      join(ROOT, 'node_modules/.bin/vitest'),
      ['run', '-c', 'vitest.dist.config.ts', '--reporter=json', `--outputFile=${out}`, 'tests/dist/links.test.ts'],
      { cwd: box, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CI: '1' } },
    );
    const report = JSON.parse(readFileSync(out, 'utf8')) as { testResults: { assertionResults: Assertion[] }[] };
    results = report.testResults.flatMap((t) => t.assertionResults);
  });

  afterAll(() => {
    if (box) rmSync(box, { recursive: true, force: true });
  });

  const statusOf = (rel: string): string[] =>
    results.filter((r) => r.ancestorTitles.some((a) => a.startsWith('A7')) && r.title === rel).map((r) => r.status);

  it('ok.html e index.html pasan', () => {
    expect(statusOf('ok.html')).toEqual(['passed']);
    expect(statusOf('index.html')).toEqual(['passed']);
  });

  it.each(Object.keys(TRAPS).filter((f) => f.startsWith('r')))('%s falla', (f) => {
    expect(statusOf(f)).toEqual(['failed']);
  });
});

// ---------------------------------------------------------------------------------------
describe('P3 adv · margen tight bajo «Última actualización»', () => {
  it('de todas las páginas con .updated, solo /privacidad lleva .tight', () => {
    const withUpd = all.filter((p) => p.doc.querySelector('main .updated'));
    expect(withUpd.map((p) => p.rel)).toEqual(expect.arrayContaining(['aviso-legal.html', 'privacidad.html', 'cookies.html']));
    const tight = withUpd.filter((p) => p.doc.querySelector('main .updated')!.classList.contains('tight')).map((p) => p.rel);
    expect(tight).toEqual(['privacidad.html']);
  });

  it('el CSS da 56px por defecto y 32px con .tight', () => {
    const css = walk(join(DIST, '_astro')).filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(css).toMatch(/main \.updated\{[^}]*margin:0 0 56px/);
    expect(css).toMatch(/main \.updated\.tight\{margin-bottom:32px\}/);
  });
});

// ---------------------------------------------------------------------------------------
// _ga_<ID>: builds a directorios temporales con distintos PUBLIC_GA_ID.
describe('P3 adv · nombre de _ga_<ID> con PUBLIC_GA_ID vacío, inválido o válido', () => {
  const CASES: [string, string | undefined, string][] = [
    ['sin variable', undefined, '_ga_[ID]'],
    ['vacía', '', '_ga_[ID]'],
    ['<script>', '<script>alert(1)</script>', '_ga_[ID]'],
    ['G-', 'G-', '_ga_[ID]'],
    ['UA-123', 'UA-123', '_ga_[ID]'],
    ['minúsculas', 'g-abc123xyz', '_ga_[ID]'],
    ['16 caracteres', 'G-ABCDEFGHIJKLMNOP', '_ga_[ID]'],
    ['con HTML detrás', 'G-ABC123XYZ"><img src=x onerror=1>', '_ga_[ID]'],
    ['con salto de línea y HTML', 'G-ABC123XYZ\n<b>x</b>', '_ga_[ID]'],
    ['válida', 'G-ABC123XYZ', '_ga_ABC123XYZ'],
    ['válida con espacios', '  G-TEST1234 ', '_ga_TEST1234'],
  ];
  const tmp = mkdtempSync(join(tmpdir(), 'p3-ga-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it.each(CASES)('%s', (_label, value, expected) => {
    const out = join(tmp, String(CASES.findIndex((c) => c[1] === value)));
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.PUBLIC_GA_ID;
    if (value !== undefined) env.PUBLIC_GA_ID = value;
    const r = spawnSync(join(ROOT, 'node_modules/.bin/astro'), ['build', '--outDir', out], { cwd: ROOT, encoding: 'utf8', env });
    expect(r.status, r.stderr).toBe(0);
    const html = readFileSync(join(out, 'cookies.html'), 'utf8');
    const d = new JSDOM(html).window.document;
    const name = norm(d.querySelectorAll('main table tbody tr')[2]?.querySelector('td, th')?.textContent);
    expect(name).toBe(expected);
    // Nunca se inyecta HTML ni el valor sin validar en ningún fichero del build.
    if (value && value.trim().length > 4 && expected === '_ga_[ID]') {
      for (const f of walk(out).filter((x) => /\.(html|css|js)$/.test(x))) {
        expect(readFileSync(f, 'utf8'), relative(out, f)).not.toContain(value.trim());
      }
    }
    expect(d.querySelectorAll('main table img, main table b, main table script')).toHaveLength(0);
  });
});

// Adversario P7a (docs/PLAN.md §2 A2/A5/A6/A8, §3, §4.4, §5, §7, §10.2): marcado y CSS de
// banner y panel de consentimiento. Sin JS: jsdom no ejecuta scripts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, it } from 'vitest';
import { DIST, distFiles, pages, read, walk } from './helpers';

const ROOT = join(import.meta.dirname, '../..');
const all = pages().map((p) => ({ ...p, name: p.file.split('/').pop()! }));

// ---------- utilidades ----------
const cidOf = (el: Element | null): string => {
  const a = [...(el?.attributes ?? [])].find((x) => x.name.startsWith('data-astro-cid-'));
  return a?.name ?? '';
};

/** CSS enlazado por una página (hojas /_astro/*.css). */
function linkedCss(doc: Document): string {
  return [...doc.querySelectorAll('link[rel=stylesheet]')]
    .map((l) => join(DIST, l.getAttribute('href')!.replace(/^\//, '')))
    .filter(existsSync)
    .map(read)
    .join('\n');
}

type Rule = { selectors: string[]; body: string };
/** Reglas «hoja» (sin llaves dentro), incluidas las de dentro de @media. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim();
    if (sel.startsWith('@')) continue;
    out.push({ selectors: sel.split(',').map((s) => s.trim()), body: m[2]! });
  }
  return out;
}

/** Reglas del componente: alguna parte del selector lleva su data-astro-cid. */
function componentRules(css: string, cid: string): Rule[] {
  return rules(css).filter((r) => r.selectors.some((s) => s.includes(cid)));
}
const strip = (s: string, cid: string) => s.split(`[${cid}]`).join('').replace(/\s+/g, ' ').trim();

// Tokens de src/styles/tokens.css
const tokensCss = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const tokens = Object.fromEntries([...tokensCss.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
function resolve(v: string): string {
  const m = /^var\(--([\w-]+)\)$/.exec(v);
  return m ? resolve(tokens[m[1]!]!) : v;
}
type RGBA = [number, number, number, number];
function parseColor(v: string): RGBA {
  const c = resolve(v);
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
  const rgba = /^rgba\(([^)]+)\)$/.exec(c);
  if (rgba) {
    const [r, g, b, a] = rgba[1]!.split(',').map((x) => parseFloat(x));
    return [r!, g!, b!, a!];
  }
  throw new Error(`color no soportado: ${c}`);
}
const over = (top: RGBA, bottom: RGBA): RGBA =>
  [0, 1, 2].map((i) => top[i]! * top[3] + bottom[i]! * (1 - top[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) =>
  [r, g, b]
    .map((x) => x / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((acc, x, i) => acc + x * [0.2126, 0.7152, 0.0722][i]!, 0);
const ratio = (a: RGBA, b: RGBA) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const isInert = (el: Element) => !!el.closest('[hidden], dialog:not([open])');
const accName = (el: Element, doc: Document) => {
  const by = el.getAttribute('aria-labelledby');
  if (by) return by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ').trim();
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
};

// ---------- tests por página ----------
describe('adv P7a · cobertura', () => {
  it('hay 5 páginas y el componente está en todas', () => {
    expect(all.map((p) => p.name).sort()).toEqual(['404.html', 'aviso-legal.html', 'cookies.html', 'index.html', 'privacidad.html']);
  });
});

describe.each(all)('adv P7a · $name', ({ doc, html }) => {
  const root = doc.querySelector('#ng-consent');
  const banner = doc.querySelector<HTMLElement>('#ng-consent-banner');
  const dialog = doc.querySelector<HTMLDialogElement>('#ng-consent-panel');
  const cid = cidOf(root);
  const css = linkedCss(doc);
  const comp = componentRules(css, cid);

  it('una sola instancia del componente e ids únicos en toda la página', () => {
    expect(doc.querySelectorAll('#ng-consent, #ng-consent-banner, #ng-consent-panel, [role=status][data-consent-status]')).toHaveLength(4);
    expect(doc.querySelectorAll('dialog')).toHaveLength(1);
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(cid).toMatch(/^data-astro-cid-/);
  });

  it('el componente va antes de <main> y después del skip link (§5)', () => {
    const skip = doc.querySelector('a.skip-link')!;
    const main = doc.querySelector('main')!;
    expect(skip).not.toBeNull();
    expect(main).not.toBeNull();
    expect(skip.compareDocumentPosition(root!) & 4).toBeTruthy(); // FOLLOWING
    expect(root!.compareDocumentPosition(main) & 4).toBeTruthy();
    expect(root!.closest('main, header, footer, nav')).toBeNull();
  });

  // --- AEPD: igual peso visual ---
  it('banner: Rechazar y Aceptar hermanos contiguos, mismos atributos salvo la acción', () => {
    const rej = banner!.querySelector('[data-consent-action=reject]')!;
    const acc = banner!.querySelector('[data-consent-action=accept]')!;
    expect(rej.parentElement).toBe(acc.parentElement);
    expect([rej.nextElementSibling, rej.previousElementSibling]).toContain(acc);
    const attrs = (e: Element) =>
      Object.fromEntries([...e.attributes].filter((a) => a.name !== 'data-consent-action').map((a) => [a.name, a.value]));
    expect(attrs(rej)).toEqual(attrs(acc));
    expect(rej.className).toBe('btn');
    expect(rej.hasAttribute('style') || acc.hasAttribute('style')).toBe(false);
  });

  it('panel: Rechazar todo y Aceptar todo idénticos y contiguos; Guardar es el único lima', () => {
    const rej = dialog!.querySelector('[data-consent-action=reject]')!;
    const acc = dialog!.querySelector('[data-consent-action=accept]')!;
    expect(rej.parentElement).toBe(acc.parentElement);
    expect([rej.nextElementSibling, rej.previousElementSibling]).toContain(acc);
    expect(rej.className).toBe(acc.className);
    expect(rej.className).toBe('btn');
    const lime = root!.querySelectorAll('[class*=lime]');
    expect(lime).toHaveLength(1);
    expect(lime[0]!.getAttribute('data-consent-action')).toBe('save');
    expect(lime[0]!.closest('dialog')).toBe(dialog);
  });

  it('CSS: ninguna regla da más peso a un botón del banner/panel que a otro (posición, acción, orden)', () => {
    const btnSelectors = comp.flatMap((r) => r.selectors).filter((s) => /\.btn\b/.test(s)).map((s) => strip(s, cid));
    const allowed = new Set(['.btn', '.btn--lime']);
    expect(btnSelectors.filter((s) => !allowed.has(s))).toEqual([]);
    const sneaky = comp.flatMap((r) => r.selectors).filter((s) => /data-consent-action|:first-child|:last-child|:nth-|:first-of-type|:last-of-type|:only-child/.test(s));
    expect(sneaky).toEqual([]);
  });

  it('§10.2: lima solo en .btn--lime y en el switch activado', () => {
    const limeSel = comp
      .filter((r) => /var\(--lime\)/.test(r.body))
      .flatMap((r) => r.selectors)
      .map((s) => strip(s, cid).replace(/"/g, ''));
    expect(new Set(limeSel)).toEqual(new Set(['.btn--lime', '.switch[aria-checked=true]']));
  });

  it('nada preseleccionado: switch false, ningún control marcado ni pulsado', () => {
    expect(root!.querySelector('[aria-checked=true], [aria-pressed=true], [checked], [selected]')).toBeNull();
    expect(root!.querySelectorAll('input, select')).toHaveLength(0);
    expect(dialog!.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('false');
  });

  // --- Sin JS ---
  it('sin JS: banner hidden, dialog cerrado, nada inerte ni aria-hidden en el contenido', () => {
    expect(banner!.hidden).toBe(true);
    expect(dialog!.hasAttribute('open')).toBe(false);
    expect(doc.querySelector('[inert]')).toBeNull();
    expect(doc.querySelector('main[aria-hidden], body[aria-hidden], footer[aria-hidden], main [aria-hidden=true] a')).toBeNull();
    expect(root!.querySelector('script, noscript')).toBeNull();
  });

  it('sin JS: el CSS no fuerza display en el banner ni en el dialog cerrado, ni bloquea el scroll', () => {
    const shown = comp.filter(
      (r) => /(^|;)\s*display\s*:/.test(r.body) && r.selectors.some((s) => /\.(banner|panel)\b|dialog/.test(s) && !/\[open\]/.test(s)),
    );
    expect(shown.map((r) => r.selectors.join(','))).toEqual([]);
    const lock = rules(css).filter((r) => r.selectors.some((s) => /^(html|body)\b/.test(s)) && /overflow\s*:\s*hidden/.test(r.body));
    expect(lock).toEqual([]);
    // El [hidden] del componente gana a cualquier display de clase.
    expect(comp.some((r) => r.selectors.some((s) => strip(s, cid) === '[hidden]') && /display:\s*none\s*!important/.test(r.body))).toBe(true);
  });

  it('sin JS: «Configurar cookies» del pie lleva a /cookies#configurar (A8)', () => {
    const a = doc.querySelector('footer a[data-consent-open]');
    expect(a?.getAttribute('href')).toBe('/cookies#configurar');
  });

  // --- A11y ---
  it('dialog con nombre accesible (aria-labelledby a un id único con texto)', () => {
    const id = dialog!.getAttribute('aria-labelledby')!;
    expect(doc.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    expect(accName(dialog!, doc)).toBe('Preferencias de cookies');
    expect(dialog!.hasAttribute('aria-label')).toBe(false);
  });

  it('todos los botones: type=button y nombre accesible no vacío; switch con role/aria-checked/nombre', () => {
    for (const b of root!.querySelectorAll('button')) {
      expect(b.getAttribute('type')).toBe('button');
      expect(accName(b, doc).length, b.outerHTML).toBeGreaterThan(1);
    }
    const sw = dialog!.querySelector('[role=switch]')!;
    expect(sw.tagName).toBe('BUTTON');
    expect(accName(sw, doc)).toBe('Cookies de analítica');
    expect(sw.querySelector('[aria-hidden=true]')).not.toBeNull();
  });

  it('región status vacía, aria-live=polite y fuera del banner y del dialog (si no, no anuncia al cerrarse)', () => {
    const st = root!.querySelector('[role=status]')!;
    expect(st.getAttribute('aria-live')).toBe('polite');
    expect(st.textContent).toBe('');
    expect(st.closest('[hidden], dialog')).toBeNull();
    expect(st.classList.contains('visually-hidden')).toBe(true);
  });

  it('orden de foco: el primer enfocable activo de <body> es el skip link y apunta a #main', () => {
    const first = [...doc.body.querySelectorAll(FOCUSABLE)].find((e) => !isInert(e))!;
    expect(first.classList.contains('skip-link')).toBe(true);
    expect(doc.getElementById(first.getAttribute('href')!.slice(1))).not.toBeNull();
    // Nada del componente tiene tabindex positivo.
    expect(root!.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull();
  });

  it('colores de texto del componente solo con tokens de contraste suficiente (ink, ink-muted, on-lime)', () => {
    const colors = comp.flatMap((r) => [...r.body.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+)/g)].map((m) => m[1]!.trim()));
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter((c) => !['var(--ink)', 'var(--ink-muted)', 'var(--on-lime)', 'inherit'].includes(c))).toEqual([]);
  });

  // --- A6/CSP ---
  it('CSP: nada en línea (script sin src, <style>, style=, on*=) y sin Google', () => {
    expect(doc.querySelectorAll('script:not([src]), style')).toHaveLength(0);
    const bad = [...doc.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name === 'style' || /^on/i.test(a.name)));
    expect(bad.map((e) => e.outerHTML.slice(0, 80))).toEqual([]);
    expect(html).not.toMatch(/googletagmanager|google-analytics/);
  });

  it('CSS enlazado: sin @import ni url() externas', () => {
    expect(css).not.toMatch(/@import/);
    const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]!);
    expect(urls.filter((u) => !u.startsWith('/_astro/'))).toEqual([]);
  });

  // --- 320 px ---
  it('320 px: ninguna regla del componente fija width/min-width/flex-basis > 320px', () => {
    const wide = comp.flatMap((r) =>
      [...r.body.matchAll(/(?:^|;)\s*(width|min-width|flex-basis|inline-size|min-inline-size)\s*:\s*(\d+)px/g)]
        .filter((m) => Number(m[2]) > 320)
        .map((m) => `${r.selectors.join(',')} ${m[0]}`),
    );
    expect(wide).toEqual([]);
    const panel = comp.find((r) => r.selectors.some((s) => strip(s, cid) === '.panel'))!;
    expect(panel.body).toMatch(/width:\s*min\(600px,\s*100% - 32px\)/);
    expect(panel.body).toMatch(/max-height:\s*calc\(100dvh - 32px\)/);
    expect(panel.body).toMatch(/overflow:\s*auto/);
    const ban = comp.find((r) => r.selectors.some((s) => strip(s, cid) === '.banner'))!;
    expect(ban.body).toMatch(/inset-inline:\s*var\(--space-4\)/);
    expect(ban.body).toMatch(/max-width:\s*560px/);
  });

  it('reduced-motion: las transiciones del componente solo bajo (prefers-reduced-motion: no-preference)', () => {
    const outside = css.replace(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
    const t = componentRules(outside, cid).filter((r) => /transition|animation/.test(r.body));
    expect(t.map((r) => r.selectors.join(','))).toEqual([]);
  });
});

describe('adv P7a · contraste (tokens.css)', () => {
  const surface = parseColor('var(--surface)');
  const bg = parseColor('var(--bg)');
  const overlay = over(parseColor('var(--overlay)'), bg);
  it.each([
    ['ink', 'surface'],
    ['ink-muted', 'surface'],
    ['ink', 'bg'],
    ['ink-muted', 'bg'],
    ['ink', 'overlay'],
    ['ink-muted', 'overlay'],
    ['on-lime', 'lime'],
  ])('%s sobre %s ≥ 4.5:1', (fg, back) => {
    const b = back === 'overlay' ? overlay : back === 'surface' ? surface : parseColor(`var(--${back})`);
    expect(ratio(parseColor(`var(--${fg})`), b)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('adv P7a · cookies#configurar sin JS', () => {
  it('cookies.html tiene #configurar con <noscript> explicativo', () => {
    const doc = new JSDOM(read(join(DIST, 'cookies.html'))).window.document;
    const sec = doc.getElementById('configurar');
    expect(sec).not.toBeNull();
    expect(sec!.querySelector('noscript')?.textContent).toMatch(/JavaScript/);
  });
});

// ---------- A2 con ID malicioso ----------
describe('adv P7a · A2 · PUBLIC_GA_ID hostil nunca se refleja', () => {
  const out = mkdtempSync(join(tmpdir(), 'ng-adv-p7a-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it.each([
    ['inyeccion-atributo', 'G-TEST1234" onmouseover="alert(1)', 'onmouseover'],
    ['inyeccion-etiqueta', '"><img src=x onerror=alert(1)><x a="', 'onerror'],
    ['minusculas', 'g-test1234', 'g-test1234'],
    ['demasiado-largo', 'G-ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
  ])('%s', (name, id, marker) => {
    const dir = join(out, name);
    execFileSync('npx', ['astro', 'build', '--outDir', dir], {
      cwd: ROOT,
      env: { ...process.env, PUBLIC_GA_ID: id },
      stdio: 'pipe',
    });
    const files = walk(dir);
    const htmls = files.filter((f) => f.endsWith('.html'));
    expect(htmls).toHaveLength(5);
    for (const f of htmls) {
      const doc = new JSDOM(readFileSync(f, 'utf8')).window.document;
      const el = doc.querySelector('#ng-consent');
      expect(el, f).not.toBeNull();
      expect(el!.hasAttribute('data-ga-id'), f).toBe(false);
      expect(doc.querySelectorAll('[onmouseover], [onerror], img[src=x]'), f).toHaveLength(0);
    }
    const leaks = files.filter((f) => /\.(html|css|js)$/.test(f) && readFileSync(f, 'utf8').includes(marker));
    expect(leaks).toEqual([]);
  });
});

it('dist existe (build previo)', () => {
  expect(distFiles().length).toBeGreaterThan(0);
  expect(readdirSync(DIST)).toContain('index.html');
});

// Adversario P7b: ejecuta el JS REAL de dist/_astro (no el fuente) sobre el HTML real de cada página,
// en jsdom con tarro de cookies real. Builds temporales con PUBLIC_GA_ID=G-TEST1234 y con PUBLIC_GA_ID=''
// (§6, A2, A6, A8): no dependen del PUBLIC_GA_ID del entorno ni de cómo se construyó dist/.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CookieJar, JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { polyfillDialog, pressEscape } from '../setup/dialog';

const ID = 'G-TEST1234';
const PAGES = ['index', 'aviso-legal', 'privacidad', 'cookies', '404'];
const ROUTE: Record<string, string> = { index: '/', '404': '/no-existe' };
type Win = Window & typeof globalThis & Record<string, unknown>;

let tmp = '';
let out = '';
let outNoId = '';
const build = (dir: string, id: string) =>
  execFileSync('npx', ['astro', 'build', '--outDir', dir], { stdio: 'pipe', env: { ...process.env, PUBLIC_GA_ID: id } });
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ng-adv-p7b-'));
  out = join(tmp, 'con-id');
  outNoId = join(tmp, 'sin-id');
  build(out, ID);
  build(outNoId, '');
}, 300_000);
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function boot(dir: string, name: string, jar = new CookieJar()) {
  const html = readFileSync(join(dir, `${name}.html`), 'utf8');
  const url = `https://nandogomez.com${ROUTE[name] ?? `/${name}`}`;
  const dom = new JSDOM(html, { url, cookieJar: jar, runScripts: 'outside-only' });
  const win = dom.window as unknown as Win;
  polyfillDialog(win);
  const doc = win.document;
  const mods = [...doc.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.getAttribute('src')!);
  for (const src of mods) {
    expect(src.startsWith('/_astro/'), src).toBe(true);
    win.eval(readFileSync(join(dir, src), 'utf8'));
  }
  const q = <T extends Element = HTMLElement>(s: string) => doc.querySelector<T>(s)!;
  return {
    win, doc, jar, mods, q,
    banner: q('#ng-consent-banner'),
    panel: q<HTMLDialogElement>('#ng-consent-panel'),
    foot: q('footer [data-consent-open]'),
    btn: (scope: string, a: string) => q(`${scope} [data-consent-action=${a}]`),
    ga: () => [...doc.querySelectorAll<HTMLScriptElement>('script[data-ng-ga]')].map((s) => s.src),
    touched: () => 'gtag' in win || 'dataLayer' in win || doc.querySelectorAll('script[data-ng-ga]').length > 0,
    cookie: () => doc.cookie,
  };
}
const click = (el: Element) =>
  el.dispatchEvent(new (el.ownerDocument.defaultView as unknown as typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true }));

describe.each(PAGES)('adv P7b · bundle real en %s.html (build con GA ID)', (name) => {
  it('un único módulo externo; sin cookie: banner visible y nada de Google', () => {
    const t = boot(out, name);
    expect(t.mods).toHaveLength(1);
    expect(t.q('#ng-consent').getAttribute('data-ga-id')).toBe(ID);
    expect(t.banner.hidden).toBe(false);
    expect(t.touched()).toBe(false);
  });

  it('Rechazar: cookie denied y nada de Google; la siguiente página no muestra banner', () => {
    const t = boot(out, name);
    click(t.btn('#ng-consent-banner', 'reject'));
    expect(t.cookie()).toMatch(/^ng_consent=v1\.denied\.\d{10}$/);
    expect(t.touched()).toBe(false);
    const next = boot(out, 'index', t.jar);
    expect(next.banner.hidden).toBe(true);
    expect(next.touched()).toBe(false);
  });

  it('el «Configurar cookies» real del pie abre el panel; toggle + Escape no guarda ni carga', () => {
    const t = boot(out, name);
    click(t.foot);
    expect(t.panel.open).toBe(true);
    expect(t.banner.hidden).toBe(true);
    click(t.btn('#ng-consent-panel', 'toggle'));
    pressEscape(t.win, t.panel);
    expect(t.cookie()).toBe('');
    expect(t.touched()).toBe(false);
    expect(t.banner.hidden).toBe(false);
  });

  it('Aceptar: un script gtag/js con el ID y, al recargar, GA otra vez sin banner', () => {
    const t = boot(out, name);
    click(t.btn('#ng-consent-banner', 'accept'));
    expect(t.ga()).toEqual([`https://www.googletagmanager.com/gtag/js?id=${ID}`]);
    const next = boot(out, name, t.jar);
    expect(next.banner.hidden).toBe(true);
    expect(next.ga()).toHaveLength(1);
  });
});

describe('adv P7b · bundle real del build sin GA ID', () => {
  it('Aceptar guarda la elección pero no toca Google', () => {
    const t = boot(outNoId, 'index');
    expect(t.q('#ng-consent').hasAttribute('data-ga-id')).toBe(false);
    click(t.btn('#ng-consent-banner', 'accept'));
    expect(t.cookie()).toMatch(/^ng_consent=v1\.granted\.\d{10}$/);
    expect(t.touched()).toBe(false);
  });
});

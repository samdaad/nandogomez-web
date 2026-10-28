import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsentUi } from '../../src/lib/consent/consent-ui';
import { polyfillDialog, pressEscape } from '../setup/dialog';

const ID = 'G-TEST1234';
const NOW = new Date('2026-10-28T12:00:00Z');
const nowS = () => Math.floor(NOW.getTime() / 1000);

// El marcado real de P7a (sin frontmatter, estilos ni script): no se duplica en el test.
function markup(gaId: string | null): string {
  const src = readFileSync('src/components/ConsentManager.astro', 'utf8');
  const body = src.replace(/^---[\s\S]*?---\s*/, '').replace(/<(style|script)[\s\S]*$/, '');
  return body.replace('data-ga-id={gaId}', gaId === null ? '' : `data-ga-id="${gaId}"`);
}

type Opts = { url?: string; cookie?: string; ga?: string | null; jar?: 'normal' | 'ignore' | 'throw'; withMain?: boolean };

function setup(o: Opts = {}) {
  const { url = 'https://nandogomez.com/', cookie = '', ga = ID, jar = 'normal', withMain = true } = o;
  const html = `<!doctype html><html><head></head><body><button id="outside">fuera</button>${markup(ga)}${withMain ? '<main id="main"><p>x</p></main>' : ''}<footer><a id="foot" href="/cookies#configurar" data-consent-open>Configurar cookies</a></footer></body></html>`;
  const dom = new JSDOM(html, { url });
  const win = dom.window as unknown as Window & typeof globalThis & Record<string, unknown>;
  polyfillDialog(win);
  const doc = win.document;
  const store = new Map<string, string>();
  for (const part of cookie.split(';').filter(Boolean)) {
    const [k, ...v] = part.trim().split('=');
    store.set(k!, v.join('='));
  }
  const writes: string[] = [];
  Object.defineProperty(doc, 'cookie', {
    configurable: true,
    get: () => {
      if (jar === 'throw') throw new DOMException('bloqueadas', 'SecurityError');
      return [...store].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set: (v: string) => {
      if (jar === 'throw') throw new DOMException('bloqueadas', 'SecurityError');
      writes.push(v);
      if (jar === 'ignore') return;
      const [pair = '', ...attrs] = v.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) store.delete(name);
      else store.set(name, pair.slice(i + 1));
    },
  });
  const q = <T extends Element = HTMLElement>(s: string) => doc.querySelector<T>(s)!;
  const banner = q('#ng-consent-banner');
  const panel = q<HTMLDialogElement>('#ng-consent-panel');
  const status = q('[data-consent-status]');
  const sw = q('[data-consent-action=toggle]');
  const btn = (scope: Element, a: string) => scope.querySelector<HTMLElement>(`[data-consent-action=${a}]`)!;
  const events: boolean[] = [];
  doc.addEventListener('ng:consent-change', (e) => events.push((e as CustomEvent<{ analytics: boolean }>).detail.analytics));
  initConsentUi(doc, win);
  return {
    win, doc, writes, store, banner, panel, status, sw, events, q,
    bannerBtn: (a: string) => btn(banner, a),
    panelBtn: (a: string) => btn(panel, a),
    foot: q('#foot'),
    scripts: () => [...doc.querySelectorAll('script[data-ng-ga]')],
    consentWrites: () => writes.filter((w) => w.startsWith('ng_consent=') && !w.includes('Max-Age=0')),
  };
}

const click = (el: Element) => el.dispatchEvent(new (el.ownerDocument.defaultView as unknown as typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true }));
const valid = (v: 'granted' | 'denied', ageS = 100) => `ng_consent=v1.${v}.${nowS() - ageS}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('arranque', () => {
  it('sin cookie muestra el banner, el panel cerrado y no carga GA', () => {
    const t = setup();
    expect(t.banner.hidden).toBe(false);
    expect(t.panel.open).toBe(false);
    expect(t.scripts()).toHaveLength(0);
    expect(t.win.gtag).toBeUndefined();
    expect(t.writes).toEqual([]);
  });

  it.each([
    ['caducada', `ng_consent=v1.granted.${nowS() - 31_536_001}`],
    ['malformada', 'ng_consent=basura'],
    ['versión 0', `ng_consent=v0.granted.${nowS()}`],
    ['fecha futura', `ng_consent=v1.granted.${nowS() + 90_000}`],
  ])('cookie %s: banner y nada de GA', (_n, cookie) => {
    const t = setup({ cookie });
    expect(t.banner.hidden).toBe(false);
    expect(t.scripts()).toHaveLength(0);
  });

  it('granted con data-ga-id válido: carga GA una vez y no muestra el banner', () => {
    const t = setup({ cookie: valid('granted') });
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(1);
    expect((t.scripts()[0] as HTMLScriptElement).src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
  });

  it.each([['sin atributo', null], ['inválido', 'G-<script>'], ['minúsculas', 'g-test1234']])('granted con data-ga-id %s: no carga GA', (_n, ga) => {
    const t = setup({ cookie: valid('granted'), ga });
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(0);
    expect(t.win.gtag).toBeUndefined();
  });

  it('denied: no carga GA, no muestra el banner y no escribe cookies', () => {
    const t = setup({ cookie: valid('denied') });
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(0);
    expect(t.writes).toEqual([]);
  });

  it('sin #ng-consent no hace nada ni lanza', () => {
    const dom = new JSDOM('<body></body>', { url: 'https://nandogomez.com/' });
    expect(() => initConsentUi(dom.window.document, dom.window as unknown as Window)).not.toThrow();
  });

  it('sin JS (initConsentUi no se ejecuta) el banner sigue hidden y el enlace es un enlace', () => {
    const dom = new JSDOM(`<body>${markup(ID)}<a id="f" href="/cookies#configurar" data-consent-open>c</a></body>`);
    expect(dom.window.document.querySelector('#ng-consent-banner')!.hasAttribute('hidden')).toBe(true);
    expect(dom.window.document.querySelector('#f')!.getAttribute('href')).toBe('/cookies#configurar');
  });
});

describe('banner: aceptar y rechazar', () => {
  it('Aceptar: cookie v1.granted con segundos, oculta, carga GA, anuncia y emite el evento', () => {
    const t = setup();
    click(t.bannerBtn('accept'));
    const [w] = t.consentWrites();
    expect(w).toBe(`ng_consent=v1.granted.${nowS()}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(1);
    expect(t.status.textContent).toBe('Preferencias guardadas: analítica aceptada');
    expect(t.events).toEqual([true]);
  });

  it('Rechazar: cookie denied, oculta, sin GA, anuncia y emite el evento', () => {
    const t = setup();
    click(t.bannerBtn('reject'));
    expect(t.consentWrites()).toEqual([`ng_consent=v1.denied.${nowS()}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`]);
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(0);
    expect(t.status.textContent).toBe('Preferencias guardadas: analítica rechazada');
    expect(t.events).toEqual([false]);
  });

  it('Aceptar sin data-ga-id guarda la cookie pero no carga GA', () => {
    const t = setup({ ga: null });
    click(t.bannerBtn('accept'));
    expect(t.consentWrites()).toHaveLength(1);
    expect(t.scripts()).toHaveLength(0);
  });

  it('en http://localhost la cookie no lleva Secure', () => {
    const t = setup({ url: 'http://localhost:4321/' });
    click(t.bannerBtn('reject'));
    expect(t.consentWrites()[0]).not.toContain('Secure');
  });

  it('tras decidir se puede recargar: la cookie escrita se lee como decisión válida', () => {
    const t = setup();
    click(t.bannerBtn('accept'));
    const again = setup({ cookie: `ng_consent=${t.store.get('ng_consent')}` });
    expect(again.banner.hidden).toBe(true);
    expect(again.scripts()).toHaveLength(1);
  });
});

describe('copias antiguas de ng_consent', () => {
  it('borra copias con Domain y Path distintos ANTES de escribir la nueva', () => {
    const t = setup({ url: 'https://www.nandogomez.com/cookies' });
    click(t.bannerBtn('reject'));
    const expired = (re: RegExp) => t.writes.findIndex((w) => w.startsWith('ng_consent=;') && re.test(w));
    const setAt = t.writes.findIndex((w) => w.startsWith('ng_consent=v1.'));
    for (const re of [/^[^;]*; Max-Age=0; Path=\/$/, /Path=\/; Domain=www\.nandogomez\.com$/, /Domain=\.nandogomez\.com$/, /Path=\/cookies/]) {
      const i = expired(re);
      expect(i, String(re)).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(setAt);
    }
  });

  it('en *.pages.dev nunca escribe Domain=.pages.dev', () => {
    const t = setup({ url: 'https://abc.nandogomez-web.pages.dev/' });
    click(t.bannerBtn('accept'));
    expect(t.writes.some((w) => /Domain=\.pages\.dev/i.test(w))).toBe(false);
    expect(t.writes.some((w) => /Domain=abc\.nandogomez-web\.pages\.dev/.test(w))).toBe(true);
  });
});

describe('panel', () => {
  it('«Configurar» abre el panel con showModal, oculta el banner y enfoca el título', () => {
    const t = setup();
    click(t.bannerBtn('open'));
    expect(t.panel.open).toBe(true);
    expect(t.banner.hidden).toBe(true);
    expect(t.doc.activeElement).toBe(t.q('#ng-consent-title'));
    expect(t.sw.getAttribute('aria-checked')).toBe('false');
  });

  it('[data-consent-open] abre el panel y evita la navegación del enlace', () => {
    const t = setup({ cookie: valid('denied') });
    const ev = new t.win.MouseEvent('click', { bubbles: true, cancelable: true });
    t.foot.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(t.panel.open).toBe(true);
  });

  it('un clic fuera de los controles no hace nada ni se previene', () => {
    const t = setup();
    const ev = new t.win.MouseEvent('click', { bubbles: true, cancelable: true });
    t.q('#outside').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(t.panel.open).toBe(false);
  });

  it('el evento ng:consent-open abre el panel (una sola vez)', () => {
    const t = setup({ cookie: valid('denied') });
    t.doc.dispatchEvent(new t.win.CustomEvent('ng:consent-open'));
    expect(t.panel.open).toBe(true);
    t.doc.dispatchEvent(new t.win.CustomEvent('ng:consent-open'));
    expect(t.panel.open).toBe(true);
  });

  it('el switch refleja lo guardado al abrir y el toggle lo cambia', () => {
    const t = setup({ cookie: valid('granted') });
    click(t.foot);
    expect(t.sw.getAttribute('aria-checked')).toBe('true');
    t.sw.focus();
    click(t.sw);
    expect(t.sw.getAttribute('aria-checked')).toBe('false');
    click(t.sw);
    expect(t.sw.getAttribute('aria-checked')).toBe('true');
    expect(t.doc.activeElement).toBe(t.sw);
  });

  it('Guardar selección con el switch activado: granted, cierra, carga GA y anuncia', () => {
    const t = setup();
    click(t.bannerBtn('open'));
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.consentWrites()[0]).toMatch(/^ng_consent=v1\.granted\.\d{10};/);
    expect(t.panel.open).toBe(false);
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(1);
    expect(t.status.textContent).toBe('Preferencias guardadas: analítica aceptada');
  });

  it('Guardar selección sin tocar el switch: denied', () => {
    const t = setup();
    click(t.bannerBtn('open'));
    click(t.panelBtn('save'));
    expect(t.consentWrites()[0]).toMatch(/^ng_consent=v1\.denied\./);
    expect(t.scripts()).toHaveLength(0);
  });

  it('Aceptar todo y Rechazar todo ignoran el borrador', () => {
    const a = setup();
    click(a.bannerBtn('open'));
    click(a.panelBtn('accept'));
    expect(a.consentWrites()[0]).toMatch(/granted/);
    expect(a.panel.open).toBe(false);
    const r = setup();
    click(r.bannerBtn('open'));
    click(r.sw);
    click(r.panelBtn('reject'));
    expect(r.consentWrites()[0]).toMatch(/denied/);
    expect(r.scripts()).toHaveLength(0);
  });
});

describe('cierre sin guardar y foco', () => {
  it('Escape sin decisión guardada: vuelve el banner, no escribe y el foco vuelve a «Configurar»', () => {
    const t = setup();
    t.bannerBtn('open').focus();
    click(t.bannerBtn('open'));
    click(t.sw);
    pressEscape(t.win, t.panel);
    expect(t.panel.open).toBe(false);
    expect(t.banner.hidden).toBe(false);
    expect(t.writes).toEqual([]);
    expect(t.doc.activeElement).toBe(t.bannerBtn('open'));
  });

  it('Escape con decisión guardada: descarta el borrador y devuelve el foco al enlace del pie', () => {
    const t = setup({ cookie: valid('denied') });
    t.foot.focus();
    click(t.foot);
    click(t.sw);
    expect(t.sw.getAttribute('aria-checked')).toBe('true');
    pressEscape(t.win, t.panel);
    expect(t.banner.hidden).toBe(true);
    expect(t.writes).toEqual([]);
    expect(t.doc.activeElement).toBe(t.foot);
    click(t.foot);
    expect(t.sw.getAttribute('aria-checked')).toBe('false');
  });

  it('«Cerrar» cierra sin guardar', () => {
    const t = setup({ cookie: valid('denied') });
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('close'));
    expect(t.panel.open).toBe(false);
    expect(t.writes).toEqual([]);
    expect(t.doc.activeElement).toBe(t.foot);
  });

  it('si el navegador cierra el diálogo sin cancel, se trata como Escape', () => {
    const t = setup();
    click(t.bannerBtn('open'));
    t.panel.close();
    expect(t.banner.hidden).toBe(false);
    expect(t.writes).toEqual([]);
  });

  it('tras guardar desde el banner (disparador oculto) el foco va a #main', () => {
    const t = setup();
    t.bannerBtn('open').focus();
    click(t.bannerBtn('open'));
    click(t.panelBtn('accept'));
    expect(t.doc.activeElement).toBe(t.q('#main'));
  });

  it('sin #main y con disparador oculto no falla', () => {
    const t = setup({ withMain: false });
    click(t.bannerBtn('open'));
    expect(() => click(t.panelBtn('reject'))).not.toThrow();
  });
});

describe('revocar y volver a conceder', () => {
  it('granted → denied: revokeAnalytics (ga-disable y borrado de _ga*) sin recargar; luego loadAnalytics', () => {
    const t = setup({ cookie: `${valid('granted')}; _ga=1; _ga_TEST1234=2` });
    expect(t.scripts()).toHaveLength(1);
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.win[`ga-disable-${ID}`]).toBe(true);
    expect(t.writes.some((w) => w.startsWith('_ga=; Max-Age=0'))).toBe(true);
    expect(t.writes.some((w) => w.startsWith('_ga_TEST1234=; Max-Age=0'))).toBe(true);
    expect(t.store.has('_ga')).toBe(false);
    expect(t.consentWrites()[0]).toMatch(/denied/);
    expect(t.events).toEqual([false]);
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.win[`ga-disable-${ID}`]).toBe(false);
    expect(t.scripts()).toHaveLength(1);
    expect(t.events).toEqual([false, true]);
  });
});

describe('cookies bloqueadas', () => {
  it('document.cookie lanza: arranca con banner, se puede rechazar y no hay GA', () => {
    const t = setup({ jar: 'throw' });
    expect(t.banner.hidden).toBe(false);
    expect(() => click(t.bannerBtn('reject'))).not.toThrow();
    expect(t.banner.hidden).toBe(true);
    expect(t.scripts()).toHaveLength(0);
    expect(t.status.textContent).toContain('analítica rechazada');
  });

  it('document.cookie lanza: aceptar no carga analítica', () => {
    const t = setup({ jar: 'throw' });
    expect(() => click(t.bannerBtn('accept'))).not.toThrow();
    expect(t.scripts()).toHaveLength(0);
    expect(t.win.gtag).toBeUndefined();
    expect(t.events).toEqual([false]);
  });

  it('la cookie no persiste: aceptar no carga analítica y lo dice', () => {
    const t = setup({ jar: 'ignore' });
    click(t.bannerBtn('accept'));
    expect(t.scripts()).toHaveLength(0);
    expect(t.banner.hidden).toBe(true);
    expect(t.status.textContent).toBe('No se han podido guardar las preferencias: analítica rechazada');
    expect(t.events).toEqual([false]);
  });
});

// Adversario P7b: casos límite de la capa DOM del consentimiento (docs/PLAN.md §4.1–§4.4, §5, A15).
// Usa el tarro de cookies REAL de jsdom (tough-cookie: Path, Domain, Secure, Max-Age) y solo registra
// las escrituras; así una cookie que el navegador rechazaría se rechaza también aquí.
import { readFileSync } from 'node:fs';
import { JSDOM, CookieJar } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsentUi } from '../../src/lib/consent/consent-ui';
import { polyfillDialog, pressEscape } from '../setup/dialog';

const ID = 'G-TEST1234';
const NOW = new Date('2026-10-28T12:00:00Z');
const nowS = () => Math.floor(NOW.getTime() / 1000);
const GOOGLE = /googletagmanager|google-analytics/;

function markup(gaAttr: string | null): string {
  const src = readFileSync('src/components/ConsentManager.astro', 'utf8');
  const body = src.replace(/^---[\s\S]*?---\s*/, '').replace(/<(style|script)[\s\S]*$/, '');
  return body.replace('data-ga-id={gaId}', gaAttr === null ? '' : `data-ga-id="${gaAttr.replace(/"/g, '&quot;')}"`);
}

type Win = Window & typeof globalThis & Record<string, unknown>;
type Opts = { url?: string; cookies?: string[]; ga?: string | null; jar?: CookieJar; mode?: 'real' | 'ignore' | 'throw'; init?: number };

function page(o: Opts = {}) {
  const { url = 'https://nandogomez.com/', cookies = [], ga = ID, jar = new CookieJar(), mode = 'real', init = 1 } = o;
  for (const c of cookies) jar.setCookieSync(c, url);
  const html = `<!doctype html><html><head></head><body><a id="skip" href="#main">Saltar</a>${markup(ga)}<main id="main"><p>x</p></main><footer><a id="foot" href="/cookies#configurar" data-consent-open>Configurar cookies</a></footer></body></html>`;
  const dom = new JSDOM(html, { url, cookieJar: jar });
  const win = dom.window as unknown as Win;
  polyfillDialog(win);
  const doc = win.document;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(doc)), 'cookie')
    ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(doc), 'cookie')!;
  const writes: string[] = [];
  const ctl = { mode };
  Object.defineProperty(doc, 'cookie', {
    configurable: true,
    get() {
      if (ctl.mode === 'throw') throw new DOMException('bloqueadas', 'SecurityError');
      return desc.get!.call(doc);
    },
    set(v: string) {
      if (ctl.mode === 'throw') throw new DOMException('bloqueadas', 'SecurityError');
      writes.push(v);
      if (ctl.mode === 'real') desc.set!.call(doc, v);
    },
  });
  const events: boolean[] = [];
  doc.addEventListener('ng:consent-change', (e) => events.push((e as CustomEvent<{ analytics: boolean }>).detail.analytics));
  for (let i = 0; i < init; i++) initConsentUi(doc, win);
  const q = <T extends Element = HTMLElement>(s: string) => doc.querySelector<T>(s)!;
  const banner = q('#ng-consent-banner');
  const panel = q<HTMLDialogElement>('#ng-consent-panel');
  const btn = (scope: Element, a: string) => scope.querySelector<HTMLElement>(`[data-consent-action=${a}]`)!;
  return {
    win, doc, jar, writes, events, banner, panel, q,
    setMode: (m: 'real' | 'ignore' | 'throw') => void (ctl.mode = m),
    sw: q('[data-consent-action=toggle]'),
    status: q('[data-consent-status]'),
    title: q('#ng-consent-title'),
    main: q('#main'),
    foot: q('#foot'),
    bannerBtn: (a: string) => btn(banner, a),
    panelBtn: (a: string) => btn(panel, a),
    // «Hay GA» = cualquier rastro: script, gtag, dataLayer o URL de Google en el documento.
    gaTouched: () =>
      doc.querySelectorAll('script[data-ng-ga]').length > 0 || 'gtag' in win || 'dataLayer' in win || GOOGLE.test(doc.documentElement.outerHTML),
    gaScripts: () => doc.querySelectorAll('script[data-ng-ga]').length,
    consentWrites: () => writes.filter((w) => /^ng_consent=v/.test(w)),
    cookie: () => desc.get!.call(doc) as string,
  };
}

const click = (el: Element, init: MouseEventInit = {}) => {
  const ev = new (el.ownerDocument.defaultView as unknown as typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};
const v1 = (v: 'granted' | 'denied', ageS = 100) => `ng_consent=v1.${v}.${nowS() - ageS}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('adv P7b · arranque sin decisión válida: banner y nada de GA', () => {
  it.each([
    ['duplicada en dos Path', [`${v1('granted')}; Path=/`, `${v1('granted', 50)}; Path=/cookies`], 'https://nandogomez.com/cookies'],
    ['duplicada en dos Domain', [`${v1('granted')}; Path=/`, `${v1('granted', 50)}; Path=/; Domain=nandogomez.com`], 'https://www.nandogomez.com/'],
    ['granted y denied a la vez', [`${v1('granted')}; Path=/`, `${v1('denied')}; Path=/; Domain=nandogomez.com`], 'https://www.nandogomez.com/'],
    ['caducada por 1 s', [`ng_consent=v1.granted.${nowS() - 31_536_001}; Path=/`], undefined],
    ['versión 0', [`ng_consent=v0.granted.${nowS()}; Path=/`], undefined],
    ['fecha a 2 días', [`ng_consent=v1.granted.${nowS() + 172_800}; Path=/`], undefined],
    ['milisegundos', [`ng_consent=v1.granted.${NOW.getTime()}; Path=/`], undefined],
    ['mayúsculas', [`ng_consent=v1.GRANTED.${nowS()}; Path=/`], undefined],
    ['entre comillas', [`ng_consent="v1.granted.${nowS()}"; Path=/`], undefined],
    ['con sufijo', [`ng_consent=v1.granted.${nowS()}x; Path=/`], undefined],
    ['nombre en mayúsculas', [`NG_CONSENT=v1.granted.${nowS()}; Path=/`], undefined],
    ['vacía', ['ng_consent=; Path=/'], undefined],
  ])('cookie %s', (_n, cookies, url) => {
    const t = page(url ? { cookies, url } : { cookies });
    expect(t.banner.hidden).toBe(false);
    expect(t.panel.open).toBe(false);
    expect(t.gaTouched()).toBe(false);
    expect(t.writes).toEqual([]);
  });

  it('banner visible tras un arranque inválido: el panel arranca con la analítica desactivada', () => {
    const t = page({ cookies: [`ng_consent=v1.granted.${nowS() - 31_536_001}; Path=/`] });
    click(t.foot);
    expect(t.sw.getAttribute('aria-checked')).toBe('false');
  });
});

describe('adv P7b · granted válido pero data-ga-id no utilizable: nada de GA', () => {
  it.each([
    ['ausente', null],
    ['vacío', ''],
    ['con espacios', ` ${ID} `],
    ['con salto de línea', `${ID}\n`],
    ['inyección', `${ID}"><script>alert(1)</script>`],
    ['UA antiguo', 'UA-12345-1'],
    ['demasiado largo', 'G-ABCDEFGHIJKLMNOP'],
  ])('data-ga-id %s', (_n, ga) => {
    const t = page({ cookies: [`${v1('granted')}; Path=/`], ga });
    expect(t.banner.hidden).toBe(true);
    expect(t.gaTouched()).toBe(false);
    click(t.foot);
    click(t.panelBtn('accept'));
    expect(t.gaTouched()).toBe(false);
  });
});

describe('adv P7b · ninguna vía carga GA sin acción explícita', () => {
  it('abrir, alternar, cerrar con Escape y con «Cerrar», y eventos ng:consent-open no cargan nada', () => {
    const t = page();
    click(t.bannerBtn('open'));
    click(t.sw);
    pressEscape(t.win, t.panel);
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('close'));
    t.doc.dispatchEvent(new t.win.CustomEvent('ng:consent-open'));
    click(t.sw);
    t.panel.close();
    expect(t.gaTouched()).toBe(false);
    expect(t.writes).toEqual([]);
    expect(t.cookie()).toBe('');
    expect(t.events).toEqual([]);
    expect(t.banner.hidden).toBe(false);
  });

  it('clics en botones ocultos del banner con el banner ya oculto no cambian la decisión', () => {
    const t = page({ cookies: [`${v1('denied')}; Path=/`] });
    click(t.bannerBtn('accept'));
    expect(t.gaTouched()).toBe(false);
    expect(t.writes).toEqual([]);
  });

  it('un botón con data-consent-action="accept" fuera de #ng-consent no decide nada', () => {
    const t = page();
    const fake = t.doc.createElement('button');
    fake.dataset.consentAction = 'accept';
    t.doc.body.append(fake);
    click(fake);
    expect(t.gaTouched()).toBe(false);
    expect(t.writes).toEqual([]);
    expect(t.banner.hidden).toBe(false);
  });
});

describe('adv P7b · aceptar, rechazar y revocar con el tarro real', () => {
  it('doble clic en Aceptar: una sola escritura, un solo script y un solo evento', () => {
    const t = page();
    click(t.bannerBtn('accept'));
    click(t.bannerBtn('accept'));
    expect(t.consentWrites()).toHaveLength(1);
    expect(t.gaScripts()).toBe(1);
    expect(t.events).toEqual([true]);
    expect(t.cookie()).toBe(`ng_consent=v1.granted.${nowS()}`);
  });

  it('Aceptar y luego Rechazar desde el panel: ga-disable, consent update denied y _ga* borradas (también Domain=.nandogomez.com)', () => {
    const t = page({ url: 'https://www.nandogomez.com/' });
    click(t.bannerBtn('accept'));
    // Lo que haría gtag.js: cookies en el dominio de nivel superior.
    t.jar.setCookieSync('_ga=GA1.1.1.1; Path=/; Domain=nandogomez.com; Max-Age=60000000', 'https://www.nandogomez.com/');
    t.jar.setCookieSync('_ga_TEST1234=GS1.1; Path=/; Domain=nandogomez.com; Max-Age=60000000', 'https://www.nandogomez.com/');
    t.jar.setCookieSync('_ga_OTRA99=GS1.1; Path=/; Max-Age=60000000', 'https://www.nandogomez.com/');
    click(t.foot);
    expect(t.sw.getAttribute('aria-checked')).toBe('true');
    click(t.panelBtn('reject'));
    expect(t.win[`ga-disable-${ID}`]).toBe(true);
    const dl = t.win.dataLayer as ArrayLike<unknown>[];
    const last = Array.from(dl[dl.length - 1]!);
    expect(last).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(t.cookie()).toBe(`ng_consent=v1.denied.${nowS()}`);
    expect(t.events).toEqual([true, false]);
    expect(t.panel.open).toBe(false);
    expect(t.banner.hidden).toBe(true);
  });

  it('Rechazar en el banner con _ga residuales (host y dominio): se borran y no se crea gtag', () => {
    const t = page({
      url: 'https://nandogomez.com/privacidad',
      cookies: ['_ga=GA1.1.9; Path=/; Domain=nandogomez.com', '_ga_TEST1234=GS1; Path=/', '_gid=x; Path=/'],
    });
    click(t.bannerBtn('reject'));
    expect(t.cookie()).not.toMatch(/_ga(_|=)/);
    expect('gtag' in t.win).toBe(false);
    expect(t.gaScripts()).toBe(0);
    expect(t.cookie()).toContain(`ng_consent=v1.denied.${nowS()}`);
  });

  it('la elección persiste: una «navegación» posterior con el mismo tarro no muestra banner (sin bucle)', () => {
    for (const [action, granted] of [['accept', true], ['reject', false]] as const) {
      const jar = new CookieJar();
      const a = page({ jar, url: 'https://www.nandogomez.com/cookies' });
      click(a.bannerBtn(action));
      const b = page({ jar, url: 'https://www.nandogomez.com/aviso-legal' });
      expect(b.banner.hidden, action).toBe(true);
      expect(b.gaScripts(), action).toBe(granted ? 1 : 0);
    }
  });

  it('con una copia antigua en Domain=.nandogomez.com, decidir deja una sola ng_consent (sin bucle)', () => {
    const jar = new CookieJar();
    const url = 'https://www.nandogomez.com/cookies';
    const a = page({ jar, url, cookies: [`ng_consent=v1.granted.${nowS() - 40_000_000}; Path=/; Domain=nandogomez.com; Max-Age=99999999`] });
    expect(a.banner.hidden).toBe(false);
    click(a.bannerBtn('reject'));
    expect(a.cookie().match(/ng_consent=/g)).toHaveLength(1);
    const b = page({ jar, url: 'https://nandogomez.com/' });
    // En el apex no se ve la cookie host-only de www: ahí se pregunta otra vez, pero la vieja ya no existe.
    expect(b.cookie()).not.toContain('ng_consent=v1.granted');
  });

  it('Rechazar desde el panel tras granted sin data-ga-id: nunca crea gtag ni dataLayer', () => {
    const t = page({ cookies: [`${v1('granted')}; Path=/`], ga: null });
    click(t.foot);
    click(t.panelBtn('reject'));
    expect(t.gaTouched()).toBe(false);
  });
});

describe('adv P7b · panel: borrador, guardar y descartar', () => {
  it('desde el pie con granted: switch en true', () => {
    const t = page({ cookies: [`${v1('granted')}; Path=/`] });
    click(t.foot);
    expect(t.panel.open).toBe(true);
    expect(t.sw.getAttribute('aria-checked')).toBe('true');
  });

  it('toggle + Escape: nada guardado ni cargado', () => {
    const t = page();
    click(t.foot);
    click(t.sw);
    pressEscape(t.win, t.panel);
    expect(t.writes).toEqual([]);
    expect(t.gaTouched()).toBe(false);
    expect(t.banner.hidden).toBe(false);
  });

  it('toggle + Cerrar: nada guardado ni cargado', () => {
    const t = page();
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('close'));
    expect(t.writes).toEqual([]);
    expect(t.gaTouched()).toBe(false);
    expect(t.banner.hidden).toBe(false);
  });

  it('toggle + Guardar: guardado granted y cargado una vez', () => {
    const t = page();
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.cookie()).toBe(`ng_consent=v1.granted.${nowS()}`);
    expect(t.gaScripts()).toBe(1);
    expect(t.events).toEqual([true]);
  });

  it('toggle dos veces + Guardar: denied y nada de GA', () => {
    const t = page();
    click(t.foot);
    click(t.sw);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.cookie()).toBe(`ng_consent=v1.denied.${nowS()}`);
    expect(t.gaTouched()).toBe(false);
  });

  it('el banner está oculto mientras el panel está abierto (desde banner y desde pie) y vuelve al cerrar sin decidir', () => {
    const t = page();
    click(t.bannerBtn('open'));
    expect(t.banner.hidden).toBe(true);
    pressEscape(t.win, t.panel);
    expect(t.banner.hidden).toBe(false);
    click(t.foot);
    expect(t.banner.hidden).toBe(true);
    click(t.panelBtn('close'));
    expect(t.banner.hidden).toBe(false);
  });
});

describe('adv P7b · foco (A15, §5)', () => {
  it('al abrir enfoca el título; al cerrar vuelve al disparador visible', () => {
    const t = page({ cookies: [`${v1('denied')}; Path=/`] });
    t.foot.focus();
    click(t.foot);
    expect(t.doc.activeElement).toBe(t.title);
    click(t.panelBtn('close'));
    expect(t.doc.activeElement).toBe(t.foot);
  });

  it('si el disparador queda oculto (Configurar del banner + decidir), el foco va a #main', () => {
    const t = page();
    t.bannerBtn('open').focus();
    click(t.bannerBtn('open'));
    click(t.panelBtn('save'));
    expect(t.doc.activeElement).toBe(t.main);
    expect(t.main.getAttribute('tabindex')).toBe('-1');
  });

  it('si el disparador desaparece del DOM mientras el panel está abierto, el foco va a #main', () => {
    const t = page({ cookies: [`${v1('denied')}; Path=/`] });
    click(t.foot);
    t.foot.remove();
    pressEscape(t.win, t.panel);
    expect(t.doc.activeElement).toBe(t.main);
  });
});

describe('adv P7b · enlaces [data-consent-open] con modificadores', () => {
  // NOTA (no bloqueante): hoy se secuestra también Ctrl/Cmd/Shift-clic. Se documenta el comportamiento
  // actual para que un cambio sea consciente; el clic central no dispara `click` en navegadores reales.
  it('clic normal: se previene y abre el panel', () => {
    const t = page();
    expect(click(t.foot).defaultPrevented).toBe(true);
    expect(t.panel.open).toBe(true);
  });
});

describe('adv P7b · cookies que no persisten: nunca GA', () => {
  it.each(['ignore', 'throw'] as const)('tarro %s: Aceptar, Aceptar todo y toggle+Guardar no cargan GA', (mode) => {
    const t = page({ mode });
    click(t.bannerBtn('accept'));
    click(t.foot);
    click(t.panelBtn('accept'));
    click(t.foot);
    if (t.sw.getAttribute('aria-checked') === 'false') click(t.sw);
    click(t.panelBtn('save'));
    expect(t.gaTouched()).toBe(false);
    expect(t.events.every((e) => e === false)).toBe(true);
  });

  it('http:// fuera de localhost: el tarro real rechaza Secure; Aceptar no carga GA y no queda decisión', () => {
    const t = page({ url: 'http://nandogomez.com/' });
    click(t.bannerBtn('accept'));
    expect(t.cookie()).not.toContain('ng_consent');
    expect(t.gaTouched()).toBe(false);
    expect(t.events).toEqual([false]);
  });

  it('http://localhost: sin Secure, Aceptar sí persiste y carga GA', () => {
    const t = page({ url: 'http://localhost:4321/' });
    click(t.bannerBtn('accept'));
    expect(t.cookie()).toBe(`ng_consent=v1.granted.${nowS()}`);
    expect(t.gaScripts()).toBe(1);
  });
});

describe('adv P7b · mensaje de estado', () => {
  it('la región de estado es role=status y anuncia cada decisión', () => {
    const t = page();
    expect(t.status.getAttribute('role')).toBe('status');
    expect(t.status.textContent).toBe('');
    click(t.bannerBtn('accept'));
    expect(t.status.textContent).toMatch(/analítica aceptada$/);
    click(t.foot);
    click(t.panelBtn('reject'));
    expect(t.status.textContent).toMatch(/analítica rechazada$/);
  });
});

describe('adv P7b · initConsentUi varias veces', () => {
  // Hoy ningún build llama dos veces (un módulo por página), pero si ocurre la UI debe seguir diciendo la
  // verdad: lo que muestra el switch es lo que se guarda, y el banner no vuelve tras decidir.
  it('dos inicializaciones: Guardar con el switch activado no hace reaparecer el banner ni duplica eventos', () => {
    const t = page({ init: 2 });
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.banner.hidden).toBe(true);
    expect(t.events).toEqual([true]);
  });

  it('dos inicializaciones: tras aceptar, reabrir y Guardar sin tocar el switch guarda exactamente lo mostrado', () => {
    const t = page({ init: 2 });
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    click(t.foot);
    const shown = t.sw.getAttribute('aria-checked');
    click(t.panelBtn('save'));
    // Lo guardado debe ser lo que el usuario veía en el switch al pulsar «Guardar selección».
    expect(t.cookie()).toBe(`ng_consent=v1.${shown === 'true' ? 'granted' : 'denied'}.${nowS()}`);
    expect(shown).toBe('true');
  });
});

describe('adv P7b · ronda 2: revocar siempre y nada de idempotencia de más', () => {
  it.each(['ignore', 'throw'] as const)('GA cargado y luego el tarro pasa a %s: Rechazar revoca igual (ga-disable y consent denied)', (m) => {
    const t = page({ cookies: [`${v1('granted')}; Path=/`] });
    expect(t.gaScripts()).toBe(1);
    t.setMode(m);
    click(t.foot);
    click(t.panelBtn('reject'));
    expect(t.win[`ga-disable-${ID}`]).toBe(true);
    const dl = t.win.dataLayer as ArrayLike<unknown>[];
    expect(Array.from(dl[dl.length - 1]!)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(t.events).toEqual([false]);
    expect(t.status.textContent).toBe('No se han podido guardar las preferencias: analítica rechazada');
  });

  it('GA cargado y la cookie denied no se puede leer después (copia duplicada imborrable): revoca igual', () => {
    const t = page({ cookies: [`${v1('granted')}; Path=/`] });
    t.setMode('ignore');
    click(t.foot);
    click(t.sw);
    click(t.panelBtn('save'));
    expect(t.win[`ga-disable-${ID}`]).toBe(true);
    expect(t.events).toEqual([false]);
  });

  it('cada documento nuevo (otra página) se inicializa aunque el módulo ya haya inicializado otro', () => {
    const jar = new CookieJar();
    const a = page({ jar, url: 'https://nandogomez.com/' });
    expect(a.banner.hidden).toBe(false);
    const b = page({ jar, url: 'https://nandogomez.com/cookies' });
    expect(b.banner.hidden).toBe(false);
    click(b.bannerBtn('accept'));
    expect(b.gaScripts()).toBe(1);
    const c = page({ jar, url: 'https://nandogomez.com/privacidad' });
    expect(c.banner.hidden).toBe(true);
    expect(c.gaScripts()).toBe(1);
  });

  it('si el #ng-consent se sustituye por uno nuevo en el mismo documento, el nuevo se inicializa', () => {
    const t = page();
    const fresh = t.q('#ng-consent').cloneNode(true) as HTMLElement;
    t.q('#ng-consent').replaceWith(fresh);
    initConsentUi(t.doc, t.win);
    const banner = fresh.querySelector<HTMLElement>('#ng-consent-banner')!;
    click(banner.querySelector('[data-consent-action=reject]')!);
    expect(banner.hidden).toBe(true);
    expect(t.cookie()).toBe(`ng_consent=v1.denied.${nowS()}`);
  });

  it('Rechazar dos veces seguidas (banner y luego panel) vuelve a anunciar la decisión', () => {
    const t = page();
    click(t.bannerBtn('reject'));
    expect(t.status.textContent).toBe('Preferencia guardada: analítica rechazada');
    click(t.foot);
    click(t.panelBtn('reject'));
    expect(t.status.textContent).toBe('Preferencia guardada: analítica rechazada');
  });

  it('teclado (Enter = click con button 0) en el enlace del pie sigue abriendo el panel', () => {
    const t = page();
    expect(click(t.foot, { button: 0, detail: 0 }).defaultPrevented).toBe(true);
    expect(t.panel.open).toBe(true);
  });
});

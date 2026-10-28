import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { gtagCommands, loadAnalytics, revokeAnalytics } from '../../src/lib/consent/analytics';

const ID = 'G-TEST1234';

function setup(url = 'https://nandogomez.com/', cookie = '') {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url });
  const doc = dom.window.document;
  const writes: string[] = [];
  Object.defineProperty(doc, 'cookie', { get: () => cookie, set: (v: string) => void writes.push(v), configurable: true });
  const win = dom.window as unknown as Window & Record<string, unknown>;
  return { doc, win, writes, scripts: () => [...doc.querySelectorAll('script')] };
}

describe('antes del consentimiento', () => {
  it('no hay script, gtag ni dataLayer', () => {
    const { win, scripts } = setup();
    expect(scripts()).toHaveLength(0);
    expect(win.gtag).toBeUndefined();
    expect(win.dataLayer).toBeUndefined();
  });
});

describe('gtagCommands', () => {
  it('sigue la secuencia exacta de 4.3', () => {
    const c = gtagCommands(ID);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual(['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' }]);
    expect(c[1]![0]).toBe('js');
    expect(c[1]![1]).toBeInstanceOf(Date);
    expect(c[2]).toEqual(['config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false }]);
  });
});

describe('loadAnalytics', () => {
  it('inyecta un único script async y empuja arguments', () => {
    const { doc, win, scripts } = setup();
    loadAnalytics(ID, doc, win);
    const s = scripts();
    expect(s).toHaveLength(1);
    expect(s[0]!.getAttribute('src')).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
    expect(s[0]!.async).toBe(true);
    const dl = win.dataLayer as unknown[];
    expect(dl).toHaveLength(3);
    for (const e of dl) expect(Object.prototype.toString.call(e)).toBe('[object Arguments]');
    expect(Array.from(dl[0] as ArrayLike<unknown>)).toEqual(gtagCommands(ID)[0]);
    expect(Array.from(dl[2] as ArrayLike<unknown>)[1]).toBe(ID);
    expect(typeof win.gtag).toBe('function');
  });

  it('es idempotente', () => {
    const { doc, win, scripts } = setup();
    loadAnalytics(ID, doc, win);
    loadAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(1);
    expect(win.dataLayer as unknown[]).toHaveLength(3);
  });

  it.each(['', '   ', 'G-AB', "G-ABCD'></script><script>x()//", 'G-TEST1234&x=1', ' G-TEST1234', undefined, null])(
    'nunca carga con ID %j',
    (bad) => {
      const { doc, win, scripts } = setup();
      loadAnalytics(bad as string, doc, win);
      expect(scripts()).toHaveLength(0);
      expect(win.dataLayer).toBeUndefined();
      expect(win.gtag).toBeUndefined();
    },
  );

  it('reutiliza un dataLayer existente', () => {
    const { doc, win } = setup();
    win.dataLayer = [['previo']];
    loadAnalytics(ID, doc, win);
    expect(win.dataLayer as unknown[]).toHaveLength(4);
  });

  it('tras revocar y volver a conceder reactiva sin duplicar script', () => {
    const { doc, win, scripts } = setup();
    loadAnalytics(ID, doc, win);
    revokeAnalytics(ID, doc, win);
    loadAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(1);
    expect(win[`ga-disable-${ID}`]).toBe(false);
    const last = Array.from((win.dataLayer as unknown[]).at(-1) as ArrayLike<unknown>);
    expect(last).toEqual(['consent', 'update', { analytics_storage: 'granted' }]);
  });
});

describe('revokeAnalytics', () => {
  const cookies = '_ga=GA1.1.1; _ga_TEST1234=GS2.1.x; ng_consent=v1.granted.1767225600; other=1';

  it('desactiva, actualiza el consentimiento y no inyecta nada', () => {
    const { doc, win, scripts } = setup('https://nandogomez.com/', cookies);
    loadAnalytics(ID, doc, win);
    revokeAnalytics(ID, doc, win);
    expect(win[`ga-disable-${ID}`]).toBe(true);
    expect(Array.from((win.dataLayer as unknown[]).at(-1) as ArrayLike<unknown>)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(scripts()).toHaveLength(1);
  });

  it('sin haber cargado: no crea script ni dataLayer, pero borra cookies', () => {
    const { doc, win, scripts, writes } = setup('https://nandogomez.com/', cookies);
    revokeAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
    expect(win.gtag).toBeUndefined();
    expect(writes.length).toBeGreaterThan(0);
  });

  it('en nandogomez.com borra _ga y _ga_<ID> con Domain host y .nandogomez.com', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', cookies);
    revokeAnalytics(ID, doc, win);
    for (const n of ['_ga', '_ga_TEST1234']) {
      expect(writes).toContain(`${n}=; Max-Age=0; Path=/`);
      expect(writes).toContain(`${n}=; Max-Age=0; Path=/; Domain=nandogomez.com`);
      expect(writes).toContain(`${n}=; Max-Age=0; Path=/; Domain=.nandogomez.com`);
    }
    expect(writes.some((w) => w.startsWith('ng_consent') || w.startsWith('other'))).toBe(false);
  });

  it('en www usa el hostname completo y .nandogomez.com', () => {
    const { doc, win, writes } = setup('https://www.nandogomez.com/', '_ga=1');
    revokeAnalytics(ID, doc, win);
    expect(writes).toContain('_ga=; Max-Age=0; Path=/; Domain=www.nandogomez.com');
    expect(writes).toContain('_ga=; Max-Age=0; Path=/; Domain=.nandogomez.com');
  });

  it('en pages.dev nunca escribe Domain=.pages.dev', () => {
    const { doc, win, writes } = setup('https://abc.nandogomez-web.pages.dev/', '_ga=1');
    revokeAnalytics(ID, doc, win);
    expect(writes).toContain('_ga=; Max-Age=0; Path=/; Domain=abc.nandogomez-web.pages.dev');
    expect(writes.some((w) => /Domain=\.?pages\.dev/.test(w) || w.includes('.nandogomez.com'))).toBe(false);
  });

  it('en localhost solo sin Domain y con Domain=localhost', () => {
    const { doc, win, writes } = setup('http://localhost:4321/', '_ga=1');
    revokeAnalytics(ID, doc, win);
    expect(writes).toEqual(['_ga=; Max-Age=0; Path=/', '_ga=; Max-Age=0; Path=/; Domain=localhost', '_ga_TEST1234=; Max-Age=0; Path=/', '_ga_TEST1234=; Max-Age=0; Path=/; Domain=localhost']);
  });

  it('con ID inválido borra igualmente las _ga* presentes y no toca ga-disable', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', '_ga=1; _ga_OTHER99=2');
    revokeAnalytics('', doc, win);
    expect(writes.some((w) => w.startsWith('_ga_OTHER99=;'))).toBe(true);
    expect(Object.keys(win).some((k) => k.startsWith('ga-disable'))).toBe(false);
  });

  it('un ID con inyección no se usa para nombrar cookies ni flags', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', '');
    revokeAnalytics('G-X; Domain=evil.com', doc, win);
    expect(writes.every((w) => !w.includes('evil'))).toBe(true);
  });
});

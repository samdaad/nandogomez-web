// Adversario P6: GA4 con Consent Mode v2 básico (docs/PLAN.md §4.2, §4.3, §5, §7).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { gtagCommands, loadAnalytics, revokeAnalytics } from '../../src/lib/consent/analytics';
import { getGaId, isValidGaId } from '../../src/lib/ga';

const ID = 'G-TEST1234';
type W = Window & Record<string, unknown>;

function setup(url = 'https://nandogomez.com/', cookie = '') {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url });
  const doc = dom.window.document;
  const writes: string[] = [];
  Object.defineProperty(doc, 'cookie', { get: () => cookie, set: (v: string) => void writes.push(v), configurable: true });
  const win = dom.window as unknown as W;
  const scripts = () => [...doc.querySelectorAll('script')];
  const dl = () => (win.dataLayer as unknown[] | undefined)?.map((e) => (Object.prototype.toString.call(e) === '[object Arguments]' ? Array.from(e as ArrayLike<unknown>) : e));
  return { dom, doc, win, writes, scripts, dl };
}

const googleish = /googletagmanager|google-analytics|analytics\.google|doubleclick/i;

describe('adv P6 · nunca se toca Google con un ID no válido', () => {
  const bad = [
    'g-test1234', 'G-test1234', ' G-TEST1234', 'G-TEST1234 ', 'G-TEST1234\n', '\nG-TEST1234', 'G-TEST\n1234',
    'G-ABC"onload="x', 'G-ABCD"onload="x', 'G-ABCD&foo=bar', 'G-ABCD#x', 'G-ABCD/../x', 'G-ABCD%20', "G-ABCD'",
    'G-ＴＥＳＴ1234', 'G-TEST１２３４', 'G-TÉST1234', 'Ｇ-TEST1234', 'G‐TEST1234', 'G-TEST1234​', 'G-TEST1234 ',
    'GT-TEST1234', 'UA-1234-1', 'AW-123456', 'G-', 'G-ABC', 'G-ABCDEFGHIJKLMNOP',
  ];
  it.each(bad)('isValidGaId(%j) es false y loadAnalytics no deja rastro', (id) => {
    expect(isValidGaId(id)).toBe(false);
    const { doc, win, scripts } = setup();
    loadAnalytics(id, doc, win);
    expect(scripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
    expect(win.gtag).toBeUndefined();
    expect(doc.documentElement.outerHTML).not.toMatch(googleish);
  });

  it.each([new String(ID), { toString: () => ID }, [ID], 1234, true])('tipos no string (%j) son inválidos', (id) => {
    expect(isValidGaId(id)).toBe(false);
  });

  it('getGaId recorta pero no acepta lo que tras recortar sigue siendo inválido', () => {
    expect(getGaId('\tG-TEST1234\n')).toBe(ID);
    expect(getGaId('"G-TEST1234"')).toBeNull();
    expect(getGaId('g-test1234')).toBeNull();
    expect(getGaId('G-TEST1234 G-OTHER99')).toBeNull();
    expect(getGaId('G-ABCD&foo=bar')).toBeNull();
  });
});

describe('adv P6 · modo básico: nada de Google hasta llamar a loadAnalytics', () => {
  it('importar los módulos no crea gtag, dataLayer, scripts ni flags', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', '_ga=1');
    expect(win.gtag).toBeUndefined();
    expect(win.dataLayer).toBeUndefined();
    expect(Object.keys(win).filter((k) => k.startsWith('ga-disable'))).toEqual([]);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(writes).toEqual([]);
  });

  it('el default no es «denied + carga» (modo avanzado): el script solo se inyecta junto a analytics_storage granted', () => {
    const { doc, win, dl } = setup();
    loadAnalytics(ID, doc, win);
    const def = dl()!.find((e) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'default') as unknown[];
    expect((def[2] as Record<string, string>).analytics_storage).toBe('granted');
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization']) expect((def[2] as Record<string, string>)[k]).toBe('denied');
    // consent default va antes que config
    const kinds = dl()!.map((e) => (e as unknown[])[0]);
    expect(kinds.indexOf('consent')).toBeLessThan(kinds.indexOf('config'));
  });

  it('gtagCommands devuelve un Date nuevo y arrays nuevos en cada llamada (sin estado compartido)', () => {
    const a = gtagCommands(ID);
    const b = gtagCommands(ID);
    expect(a[0]![2]).not.toBe(b[0]![2]);
    (a[2]![2] as Record<string, unknown>).allow_google_signals = true;
    expect((gtagCommands(ID)[2]![2] as Record<string, unknown>).allow_google_signals).toBe(false);
  });
});

describe('adv P6 · script inyectado compatible con la CSP de §7', () => {
  it('solo src https://www.googletagmanager.com, async y data-ng-ga; sin inline, on*, nonce ni integrity', () => {
    const { doc, win, scripts } = setup();
    loadAnalytics(ID, doc, win);
    const [s] = scripts();
    expect(s!.parentElement).toBe(doc.head);
    expect(s!.textContent).toBe('');
    const attrs = [...s!.attributes].map((a) => a.name).sort();
    expect(attrs).toEqual(['data-ng-ga', 'src']);
    expect(s!.async).toBe(true);
    const u = new URL(s!.src);
    expect(u.protocol).toBe('https:');
    expect(u.hostname).toBe('www.googletagmanager.com');
    // script-src 'self' https://*.googletagmanager.com
    expect(/^[a-z0-9-]+\.googletagmanager\.com$/.test(u.hostname)).toBe(true);
    expect([...u.searchParams.keys()]).toEqual(['id']);
    expect(u.searchParams.get('id')).toBe(ID);
    // no hay <style> ni style= añadidos
    expect(doc.querySelectorAll('style,[style]')).toHaveLength(0);
  });
});

describe('adv P6 · secuencias load/revoke', () => {
  it('load → revoke → load → revoke deja medición desactivada, un solo script y cookies borradas dos veces', () => {
    const { doc, win, writes, scripts, dl } = setup('https://nandogomez.com/', '_ga=1; _ga_TEST1234=2');
    loadAnalytics(ID, doc, win);
    revokeAnalytics(ID, doc, win);
    loadAnalytics(ID, doc, win);
    expect(win[`ga-disable-${ID}`]).toBe(false);
    revokeAnalytics(ID, doc, win);
    expect(win[`ga-disable-${ID}`]).toBe(true);
    expect(scripts()).toHaveLength(1);
    const updates = dl()!.filter((e) => (e as unknown[])[1] === 'update').map((e) => ((e as unknown[])[2] as Record<string, string>).analytics_storage);
    expect(updates).toEqual(['denied', 'granted', 'denied']);
    expect(writes.filter((w) => w === '_ga=; Max-Age=0; Path=/; Domain=.nandogomez.com')).toHaveLength(2);
  });

  it('load repetido sin revocar no empuja nada más (idempotente aunque se llame 50 veces)', () => {
    const { doc, win, dl, scripts } = setup();
    for (let i = 0; i < 50; i++) loadAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(1);
    expect(dl()).toHaveLength(3);
  });

  it('revoke repetido sin cargar nunca crea gtag, dataLayer ni script', () => {
    const { doc, win, scripts } = setup('https://nandogomez.com/', '_ga=1');
    for (let i = 0; i < 5; i++) revokeAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(0);
    expect(win.gtag).toBeUndefined();
    expect(win.dataLayer).toBeUndefined();
  });

  // ROJO: rechazar primero (revoke sin carga previa) y aceptar después en la misma página
  // inyecta gtag.js con `ga-disable-<id>` todavía en true: el usuario acepta y no se mide.
  it('revoke (sin carga previa) → load: la medición queda activa tras aceptar', () => {
    const { doc, win, scripts } = setup('https://nandogomez.com/', '_ga=1');
    revokeAnalytics(ID, doc, win);
    loadAnalytics(ID, doc, win);
    expect(scripts()).toHaveLength(1);
    expect(win[`ga-disable-${ID}`]).not.toBe(true);
  });

  it('revoke se desactiva ANTES de tocar cookies (si escribir cookie lanza, la medición ya está parada)', () => {
    const { doc, win } = setup('https://nandogomez.com/', '_ga=1');
    loadAnalytics(ID, doc, win);
    Object.defineProperty(doc, 'cookie', { get: () => '_ga=1', set: () => { throw new Error('bloqueado'); }, configurable: true });
    try { revokeAnalytics(ID, doc, win); } catch { /* evaluado aparte */ }
    expect(win[`ga-disable-${ID}`]).toBe(true);
    const last = Array.from((win.dataLayer as unknown[]).at(-1) as ArrayLike<unknown>);
    expect(last).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
  });

  // ROJO: §5 «Cookies bloqueadas o document.cookie lanza excepción → todo va en try/catch».
  it('revokeAnalytics no lanza si document.cookie lanza al leer o al escribir', () => {
    const { doc, win } = setup();
    loadAnalytics(ID, doc, win);
    Object.defineProperty(doc, 'cookie', { get: () => { throw new DOMException('x', 'SecurityError'); }, set: () => { throw new DOMException('x', 'SecurityError'); }, configurable: true });
    expect(() => revokeAnalytics(ID, doc, win)).not.toThrow();
  });
});

describe('adv P6 · dataLayer y gtag preexistentes', () => {
  it('dataLayer con basura y eventos de terceros: se conservan y lo nuestro va al final como Arguments', () => {
    const { doc, win } = setup();
    const foreign = [{ event: 'tercero' }, 'basura', null, 42, ['x']];
    win.dataLayer = [...foreign];
    loadAnalytics(ID, doc, win);
    const dl = win.dataLayer as unknown[];
    expect(dl.slice(0, foreign.length)).toEqual(foreign);
    expect(dl.slice(foreign.length).map((e) => Object.prototype.toString.call(e))).toEqual(Array(3).fill('[object Arguments]'));
  });

  it('dataLayer null/undefined se reemplaza por un array', () => {
    const { doc, win } = setup();
    win.dataLayer = null;
    loadAnalytics(ID, doc, win);
    expect(Array.isArray(win.dataLayer)).toBe(true);
  });

  it('dataLayer que no es array: falla cerrado (nunca inyecta el script)', () => {
    for (const v of ['str', {}, 5]) {
      const { doc, win, scripts } = setup();
      win.dataLayer = v;
      try { loadAnalytics(ID, doc, win); } catch { /* aceptable: falla cerrado */ }
      expect(scripts()).toHaveLength(0);
    }
  });

  it('window.gtag ajeno: se reutiliza y recibe la secuencia completa antes del script', () => {
    const { doc, win, scripts } = setup();
    const calls: unknown[][] = [];
    win.gtag = (...a: unknown[]) => { calls.push(a); expect(scripts()).toHaveLength(0); };
    loadAnalytics(ID, doc, win);
    expect(calls.map((c) => c[0])).toEqual(['consent', 'js', 'config']);
    expect(scripts()).toHaveLength(1);
  });

  it('window.gtag no función: falla cerrado sin script', () => {
    const { doc, win, scripts } = setup();
    win.gtag = 'nope';
    try { loadAnalytics(ID, doc, win); } catch { /* aceptable */ }
    expect(scripts()).toHaveLength(0);
  });

  it('revoke con gtag ajeno lo llama con denied', () => {
    const { doc, win } = setup();
    const calls: unknown[][] = [];
    win.gtag = (...a: unknown[]) => void calls.push(a);
    revokeAnalytics(ID, doc, win);
    expect(calls).toEqual([['consent', 'update', { analytics_storage: 'denied' }]]);
  });
});

describe('adv P6 · borrado de cookies por host', () => {
  const header = '_ga=1; _ga_TEST1234=2; _ga_OTHER99=3; ng_consent=v1.granted.1767225600; _gat=1; _gid=1; __ga=1; x_ga=1; _GA=1; _gac_x=1; _galleta=1';
  const cases: [string, string[], boolean][] = [
    ['http://localhost:4321/', ['localhost'], false],
    ['http://127.0.0.1:4321/', ['127.0.0.1'], false],
    ['https://preview-abc.nandogomez-web.pages.dev/', ['preview-abc.nandogomez-web.pages.dev'], false],
    ['https://nandogomez.com/', ['nandogomez.com'], true],
    ['https://www.nandogomez.com/', ['www.nandogomez.com'], true],
    ['https://NandoGomez.com/', ['nandogomez.com'], true],
    ['https://nandogomez.com.evil.io/', ['nandogomez.com.evil.io'], false],
    ['https://evilnandogomez.com/', ['evilnandogomez.com'], false],
  ];
  it.each(cases)('%s', (url, hosts, parent) => {
    const { doc, win, writes } = setup(url, header);
    revokeAnalytics(ID, doc, win);
    const names = new Set(writes.map((w) => w.split('=')[0]));
    expect([...names].sort()).toEqual(['_ga', '_ga_OTHER99', '_ga_TEST1234']);
    for (const n of names) {
      const mine = writes.filter((w) => w.startsWith(`${n}=;`));
      const expected = [`${n}=; Max-Age=0; Path=/`, ...hosts.map((h) => `${n}=; Max-Age=0; Path=/; Domain=${h}`)];
      if (parent) expected.push(`${n}=; Max-Age=0; Path=/; Domain=.nandogomez.com`);
      expect(mine).toEqual(expected);
    }
    for (const w of writes) {
      expect(w).toMatch(/^_ga(_[A-Z0-9]+)?=; Max-Age=0; Path=\/(; Domain=[^;]+)?$/);
      expect(w).not.toMatch(/Domain=\.?pages\.dev|Domain=\.?evil\.io|Domain=\.?com$/i);
    }
    if (!parent) expect(writes.some((w) => w.endsWith('Domain=.nandogomez.com'))).toBe(false);
  });

  it('el nombre de la cookie de propiedad es _ga_<ID sin "G-">', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', '');
    revokeAnalytics('G-ABCDEFGHIJKLMNO', doc, win);
    expect(writes).toContain('_ga_ABCDEFGHIJKLMNO=; Max-Age=0; Path=/');
    expect(writes.some((w) => w.startsWith('_ga_G-'))).toBe(false);
  });

  it('cookies duplicadas en la cabecera no producen escrituras duplicadas', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', '_ga=1; _ga=2; _ga_TEST1234=a; _ga_TEST1234=b');
    revokeAnalytics(ID, doc, win);
    expect(new Set(writes).size).toBe(writes.length);
  });

  it('nunca escribe ng_consent ni cookies que no sean _ga/_ga_*', () => {
    const { doc, win, writes } = setup('https://nandogomez.com/', header);
    revokeAnalytics(ID, doc, win);
    expect(writes.some((w) => /^(ng_consent|_gat|_gid|__ga|x_ga|_GA|_gac_x|_galleta)=/.test(w))).toBe(false);
  });
});

describe('adv P6 · sin cableado en P6', () => {
  it('ningún .astro ni script de cliente importa analytics.ts todavía', () => {
    const out = execSync("grep -rlE \"consent/analytics|googletagmanager\" src --include=*.astro --include=*.ts || true", { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    expect(out).toEqual(['src/lib/consent/analytics.ts']);
  });

  it('la URL de gtag solo vive en analytics.ts', () => {
    expect(readFileSync('src/lib/consent/analytics.ts', 'utf8')).toContain("'https://www.googletagmanager.com/gtag/js?id='");
  });
});

// Adversario P5: casos límite del núcleo de consentimiento (docs/PLAN.md §4.1, §4.2, §5).
import { describe, expect, it } from 'vitest';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  CONSENT_VERSION,
  expireCookieWrites,
  gaCookiesToClear,
  needsPrompt,
  parseConsent,
  readConsent,
  serializeConsent,
  useSecureAttribute,
  writeConsent,
  type Consent,
} from '../../src/lib/consent/core';
import { reduce, type Action, type UiState } from '../../src/lib/consent/state';

const NOW = 1_767_225_600; // 2026-01-01T00:00:00Z
const ok = (v = 'v1.granted.' + NOW) => `${CONSENT_COOKIE}=${v}`;

describe('adv P5 · parseConsent con entradas hostiles', () => {
  const nullCases: [string, string][] = [
    ['analytics=1 en otra cookie', 'analytics=1; consent=granted; ng_consent_x=v1.granted.' + NOW],
    ['nombre con prefijo', 'x_ng_consent=v1.granted.' + NOW],
    ['nombre con sufijo', 'ng_consent2=v1.granted.' + NOW],
    ['nombre en mayúsculas', 'NG_CONSENT=v1.granted.' + NOW],
    ['nombre con homoglifo cirílico', 'ng_cоnsent=v1.granted.' + NOW],
    ['valor en mayúsculas', ok('V1.GRANTED.' + NOW)],
    ['Granted capitalizado', ok('v1.Granted.' + NOW)],
    ['orden de campos cambiado', ok('granted.v1.' + NOW)],
    ['timestamp primero', ok(NOW + '.v1.granted')],
    ['prefijo en el valor', ok('xv1.granted.' + NOW)],
    ['sufijo en el valor', ok('v1.granted.' + NOW + 'x')],
    ['sufijo con salto de línea', ok('v1.granted.' + NOW + '\n')],
    ['salto de línea antes', `${CONSENT_COOKIE}=\nv1.granted.${NOW}`],
    ['espacio interno', ok('v1. granted.' + NOW)],
    ['NBSP alrededor', `${CONSENT_COOKIE}= v1.granted.${NOW} `],
    ['espacio de ancho cero', ok('v1.granted.​' + NOW)],
    ['dígitos árabe-índicos', ok('v1.granted.١٧٦٧٢٢٥٦٠٠')],
    ['dígitos de ancho completo', ok('v１.granted.' + NOW)],
    ['entre comillas', ok(`"v1.granted.${NOW}"`)],
    ['codificado con %', ok('v1.granted%2E' + NOW)],
    ['granted|denied a la vez', ok('v1.granted|denied.' + NOW)],
    ['grantedx', ok('v1.grantedx.' + NOW)],
    ['versión 0', ok('v0.granted.' + NOW)],
    ['versión con cero inicial', ok('v01.granted.' + NOW)],
    ['versión de 4 cifras', ok('v1000.granted.' + NOW)],
    ['versión negativa', ok('v-1.granted.' + NOW)],
    ['timestamp de 9 cifras', ok('v1.granted.' + String(NOW).slice(1))],
    ['timestamp de 11 cifras', ok('v1.granted.' + NOW + '0')],
    ['timestamp en ms', ok('v1.granted.' + NOW * 1000)],
    ['timestamp negativo', ok('v1.granted.-' + String(NOW).slice(1))],
    ['timestamp NaN', ok('v1.granted.NaN')],
    ['timestamp decimal', ok('v1.granted.' + NOW + '.5')],
    ['timestamp exponencial', ok('v1.granted.1.7e9')],
    ['valor vacío', `${CONSENT_COOKIE}=`],
    ['sin signo igual', CONSENT_COOKIE],
    ['valor enorme', ok('v1.granted.' + '9'.repeat(100_000))],
    ['valor enorme con granted', ok('v1.' + 'granted.'.repeat(50_000) + NOW)],
    ['duplicada granted+denied', `${ok()}; ${ok('v1.denied.' + NOW)}`],
    ['duplicada granted+basura', `${ok()}; ${CONSENT_COOKIE}=x`],
  ];
  it.each(nullCases)('%s → null (se vuelve a preguntar)', (_l, header) => {
    expect(parseConsent(header, NOW)).toBeNull();
    expect(needsPrompt(parseConsent(header, NOW))).toBe(true);
  });

  it('cabecera vacía, solo separadores o basura masiva → null', () => {
    expect(parseConsent('', NOW)).toBeNull();
    expect(parseConsent(';;;; ;', NOW)).toBeNull();
    expect(parseConsent('a=b;'.repeat(20_000), NOW)).toBeNull();
  });

  it('la cookie válida entre muchas otras se lee y no se confunde', () => {
    const h = `_ga=GA1.1.1.1; a=analytics=granted; ${ok('v1.denied.' + NOW)}; z=v1.granted.${NOW}`;
    expect(parseConsent(h, NOW)).toEqual({ version: 1, analytics: false, savedAt: NOW });
  });

  it('tab y espacio (OWS) alrededor se toleran; el resultado es el que dice el valor', () => {
    expect(parseConsent(` \t${CONSENT_COOKIE}\t = \tv1.denied.${NOW} \t`, NOW)?.analytics).toBe(false);
  });

  it('versión mayor que la actual se acepta (el plan solo invalida la menor)', () => {
    expect(parseConsent(ok('v999.granted.' + NOW), NOW)).toEqual({ version: 999, analytics: true, savedAt: NOW });
  });

  it('caducidad: exactamente 12 meses vale; un segundo más, no', () => {
    expect(parseConsent(ok(), NOW + CONSENT_MAX_AGE_S)).not.toBeNull();
    expect(parseConsent(ok(), NOW + CONSENT_MAX_AGE_S + 1)).toBeNull();
  });

  it('futuro: exactamente 1 día vale; un segundo más, no', () => {
    expect(parseConsent(ok('v1.granted.' + (NOW + 86_400)), NOW)).not.toBeNull();
    expect(parseConsent(ok('v1.granted.' + (NOW + 86_401)), NOW)).toBeNull();
  });

  it('reloj atrasado años respecto a cuando se guardó → null', () => {
    expect(parseConsent(ok(), NOW - 2 * CONSENT_MAX_AGE_S)).toBeNull();
  });

  it('reloj adelantado años → null', () => {
    expect(parseConsent(ok(), NOW + 3 * CONSENT_MAX_AGE_S)).toBeNull();
  });

  it('nowS no finito: no debe aceptar un granted (NaN/±Infinity)', () => {
    // NOTA: con NaN las comparaciones son falsas y la cookie pasa. Se documenta el comportamiento real.
    expect(parseConsent(ok(), Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseConsent(ok(), Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('el valor se lee sin mezclar el resultado de ejecuciones previas (regex sin estado)', () => {
    for (let i = 0; i < 3; i++) {
      expect(parseConsent(ok(), NOW)?.analytics).toBe(true);
      expect(parseConsent(ok('v1.denied.' + NOW), NOW)?.analytics).toBe(false);
    }
  });

  it('readConsent: si read devuelve algo que no es cadena o lanza → null', () => {
    expect(readConsent(() => undefined as unknown as string, NOW)).toBeNull();
    expect(readConsent(() => { throw new Error('SecurityError'); }, NOW)).toBeNull();
  });
});

describe('adv P5 · serializeConsent y atributos', () => {
  it('atributos exactos del contrato, Max-Age y nunca Expires ni Domain', () => {
    const s = serializeConsent(true, NOW, { secure: true });
    expect(s).toBe(`ng_consent=v1.granted.${NOW}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    expect(s).not.toMatch(/expires|domain/i);
    const d = serializeConsent(false, NOW, { secure: false });
    expect(d).toBe(`ng_consent=v1.denied.${NOW}; Path=/; Max-Age=31536000; SameSite=Lax`);
  });

  it('ida y vuelta: lo que se escribe se relee igual (granted y denied)', () => {
    for (const a of [true, false]) {
      const value = serializeConsent(a, NOW + 0.9, { secure: true }).split(';')[0]!;
      expect(parseConsent(value, NOW)).toEqual({ version: CONSENT_VERSION, analytics: a, savedAt: NOW });
    }
  });

  it('writeConsent devuelve false si el navegador lanza y true si escribe', () => {
    const writes: string[] = [];
    expect(writeConsent((c) => writes.push(c), false, NOW, { secure: true })).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writeConsent(() => { throw new Error('blocked'); }, true, NOW, { secure: true })).toBe(false);
  });

  const secureCases: [string, string, boolean][] = [
    ['http:', 'localhost', false],
    ['http:', '127.0.0.1', false],
    ['https:', 'localhost', true],
    ['https:', '127.0.0.1', true],
    ['http:', 'localhost.evil.com', true],
    ['http:', 'evil-localhost', true],
    ['http:', '127.0.0.1.nip.io', true],
    ['http:', '127.0.0.2', true],
    ['http:', '[::1]', true],
    ['http:', '::1', true],
    ['http:', 'nandogomez.com', true],
    ['https:', 'nandogomez.com', true],
    ['https:', 'x.pages.dev', true],
    ['file:', '', true],
  ];
  it.each(secureCases)('Secure con %s//%s → %s', (protocol, host, expected) => {
    expect(useSecureAttribute(protocol, host)).toBe(expected);
  });
});

describe('adv P5 · expireCookieWrites', () => {
  const hosts = ['x.pages.dev', 'abc123.nandogomez-web.pages.dev', 'pages.dev', 'localhost', '127.0.0.1', 'evilnandogomez.com', 'nandogomez.com.evil.io'];
  it.each(hosts)('%s: nunca Domain=.pages.dev, ni .nandogomez.com, ni dominio público', (h) => {
    const w = expireCookieWrites('_ga', h);
    expect(w.join('\n')).not.toMatch(/Domain=\.pages\.dev/i);
    expect(w.join('\n')).not.toMatch(/Domain=\.nandogomez\.com/);
    expect(w.filter((x) => /Domain=/.test(x))).toEqual([`_ga=; Max-Age=0; Path=/; Domain=${h}`]);
    for (const x of w) expect(x).toMatch(/^_ga=; Max-Age=0; Path=\//);
  });

  it('nandogomez.com y subdominios (mayúsculas incluidas) añaden .nandogomez.com', () => {
    expect(expireCookieWrites('_ga', 'WWW.NandoGomez.com')).toEqual([
      '_ga=; Max-Age=0; Path=/',
      '_ga=; Max-Age=0; Path=/; Domain=www.nandogomez.com',
      '_ga=; Max-Age=0; Path=/; Domain=.nandogomez.com',
    ]);
  });

  it('gaCookiesToClear: solo _ga y _ga_*, sin duplicados y sin falsos positivos', () => {
    const h = '_ga=1; _ga_ABC=2; _gat=3; _gid=4; x_ga=5; _ga=6; _GA=7; _ga_=8; ng_consent=v1.granted.1767225600';
    expect(gaCookiesToClear(h)).toEqual(['_ga', '_ga_ABC', '_ga_']);
  });
});

describe('adv P5 · reductor: nunca analytics=true sin decisión explícita', () => {
  const init = (saved: Consent | null): UiState => reduce({ view: 'hidden', draft: false, saved: null }, { type: 'init', saved });
  const granted: Consent = { version: 1, analytics: true, savedAt: NOW };
  const denied: Consent = { version: 1, analytics: false, savedAt: NOW };

  it('estado inicial sin decisión: banner, draft=false, saved=null', () => {
    expect(init(null)).toEqual({ view: 'banner', draft: false, saved: null });
  });

  const neutral: Action[] = [{ type: 'open' }, { type: 'escape' }, { type: 'reject' }, { type: 'save' }, { type: 'init', saved: null }];
  const all: Action[] = [...neutral, { type: 'toggle' }, { type: 'accept' }];

  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }

  it('fuzz: sin accept ni toggle, saved.analytics nunca es true (desde null o desde denied)', () => {
    const r = rng(42);
    for (const start of [null, denied]) {
      for (let run = 0; run < 2000; run++) {
        let s = init(start);
        for (let i = 0; i < 20; i++) {
          s = reduce(s, neutral[Math.floor(r() * neutral.length)]!);
          expect(s.saved?.analytics ?? false).toBe(false);
          expect(s.draft).toBe(false);
        }
      }
    }
  });

  it('fuzz: saved solo cambia con init/accept/reject/save; save guarda exactamente el draft; accept→true; reject→false', () => {
    const r = rng(7);
    for (let run = 0; run < 2000; run++) {
      let s = init(r() < 0.5 ? null : r() < 0.5 ? granted : denied);
      for (let i = 0; i < 25; i++) {
        const a = all[Math.floor(r() * all.length)]!;
        const n = reduce(s, a);
        if (a.type === 'open' || a.type === 'toggle' || a.type === 'escape') expect(n.saved).toBe(s.saved);
        if (a.type === 'save') expect(n.saved?.analytics ?? null).toBe(s.view === 'panel' ? s.draft : (s.saved?.analytics ?? null));
        if (a.type === 'accept' && s.view !== 'hidden') expect(n.saved?.analytics).toBe(true);
        if (a.type === 'reject' && s.view !== 'hidden') expect(n.saved?.analytics).toBe(false);
        // la vista oculta nunca convive con «sin decisión» salvo que nunca se haya iniciado
        if (n.saved === null && a.type !== 'init') expect(n.view).not.toBe('hidden');
        s = n;
      }
    }
  });

  it('revocar desde el panel (open → reject) y desde el switch (open → toggle → save) deja false', () => {
    const s = init(granted);
    expect(reduce(reduce(s, { type: 'open' }), { type: 'reject' }).saved?.analytics).toBe(false);
    const t = reduce(reduce(reduce(s, { type: 'open' }), { type: 'toggle' }), { type: 'save' });
    expect(t.saved?.analytics).toBe(false);
    expect(t.view).toBe('hidden');
  });

  it('borrador descartado con escape no se filtra al siguiente open ni a save', () => {
    let s = init(null);
    s = reduce(s, { type: 'open' });
    s = reduce(s, { type: 'toggle' });
    s = reduce(s, { type: 'escape' });
    expect(s).toEqual({ view: 'banner', draft: false, saved: null });
    s = reduce(s, { type: 'open' });
    expect(s.draft).toBe(false);
    s = reduce(s, { type: 'save' });
    expect(s.saved?.analytics).toBe(false);
  });

  it('toggle fuera del panel (banner) no arma el borrador para un save posterior', () => {
    let s = init(null);
    s = reduce(s, { type: 'toggle' });
    s = reduce(s, { type: 'open' });
    s = reduce(s, { type: 'save' });
    expect(s.saved?.analytics).toBe(false);
  });

  it('idempotencia: accept/reject/save repetidos no cambian el resultado', () => {
    const a = reduce(reduce(init(null), { type: 'accept' }), { type: 'accept' });
    expect(a.saved?.analytics).toBe(true);
    const b = reduce(reduce(init(granted), { type: 'open' }), { type: 'reject' });
    expect(reduce(b, { type: 'reject' })).toEqual(b);
    expect(reduce(b, { type: 'save' })).toEqual(b);
  });

  it('acción desconocida no altera el estado', () => {
    const s = init(null);
    expect(reduce(s, { type: 'grant-all' } as unknown as Action)).toBe(s);
  });

  it('decisión nueva sin saved previo: savedAt=0 marca «a fijar por la capa DOM», versión actual', () => {
    const s = reduce(init(null), { type: 'accept' });
    expect(s.saved).toEqual({ version: CONSENT_VERSION, analytics: true, savedAt: 0 });
  });
});

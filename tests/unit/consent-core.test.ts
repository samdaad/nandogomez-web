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
} from '../../src/lib/consent/core';

const NOW = 1_767_225_600;
const ok = (analytics: boolean, savedAt = NOW) => ({ version: 1, analytics, savedAt });

describe('constantes', () => {
  it('cumplen el contrato 4.1', () => {
    expect(CONSENT_COOKIE).toBe('ng_consent');
    expect(CONSENT_VERSION).toBe(1);
    expect(CONSENT_MAX_AGE_S).toBe(31_536_000);
  });
});

describe('parseConsent', () => {
  it('lee granted y denied', () => {
    expect(parseConsent('ng_consent=v1.granted.1767225600', NOW)).toEqual(ok(true));
    expect(parseConsent('ng_consent=v1.denied.1767225600', NOW)).toEqual(ok(false));
  });
  it('encuentra la cookie entre otras, con espacios', () => {
    expect(parseConsent('a=1; ng_consent=v1.granted.1767225600 ; b=2', NOW)).toEqual(ok(true));
    expect(parseConsent('ng_consent=v1.denied.1767225600;b=2', NOW)).toEqual(ok(false));
  });
  it.each([
    ['ausente', ''],
    ['sin la cookie', 'a=1; b=2'],
    ['vacía', 'ng_consent='],
    ['solo espacios', 'ng_consent=   '],
    ['sin valor ni signo', 'ng_consent'],
    ['corrupta', 'ng_consent=basura'],
    ['sin versión', 'ng_consent=granted.1767225600'],
    ['con valor no permitido', 'ng_consent=v1.maybe.1767225600'],
    ['con mayúsculas', 'ng_consent=v1.GRANTED.1767225600'],
    ['con savedAt corto', 'ng_consent=v1.granted.176722560'],
    ['con savedAt largo', 'ng_consent=v1.granted.17672256000'],
    ['con savedAt no numérico', 'ng_consent=v1.granted.17672256ab'],
    ['con sufijo', 'ng_consent=v1.granted.1767225600x'],
    ['con prefijo', 'ng_consent=xv1.granted.1767225600'],
    ['con salto de línea', 'ng_consent=v1.granted.1767225600\n'],
    ['con comillas', 'ng_consent="v1.granted.1767225600"'],
    ['codificada con %', 'ng_consent=v1%2Egranted%2E1767225600'],
    ['codificada con %2C', 'ng_consent=v1%2Cgranted%2C1767225600'],
    ['versión 0', 'ng_consent=v0.granted.1767225600'],
    ['versión con cero inicial', 'ng_consent=v01.granted.1767225600'],
    ['versión de 4 cifras', 'ng_consent=v1000.granted.1767225600'],
    ['nombre ng_consent2', 'ng_consent2=v1.granted.1767225600'],
    ['nombre xng_consent', 'xng_consent=v1.granted.1767225600'],
    ['nombre con mayúsculas', 'NG_CONSENT=v1.granted.1767225600'],
    ['nombre con guion', 'ng-consent=v1.granted.1767225600'],
  ])('devuelve null: %s', (_n, header) => {
    expect(parseConsent(header, NOW)).toBeNull();
  });

  it('ignora cookies de nombre parecido y usa la buena', () => {
    const h = 'xng_consent=v1.denied.1767225600; ng_consent2=v1.denied.1767225600; ng_consent=v1.granted.1767225600';
    expect(parseConsent(h, NOW)).toEqual(ok(true));
  });
  it('cookie duplicada: ambigua, vuelve a preguntar', () => {
    const h = 'ng_consent=v1.granted.1767225600; ng_consent=v1.denied.1767225600';
    expect(parseConsent(h, NOW)).toBeNull();
    expect(parseConsent('ng_consent=v1.granted.1767225600; ng_consent=zzz', NOW)).toBeNull();
  });

  describe('caducidad y fechas', () => {
    it('vale justo en el límite de 12 meses', () => {
      expect(parseConsent('ng_consent=v1.granted.1767225600', NOW + 31_536_000)).toEqual(ok(true));
    });
    it('caduca un segundo después', () => {
      expect(parseConsent('ng_consent=v1.granted.1767225600', NOW + 31_536_001)).toBeNull();
    });
    it('tolera hasta 1 día en el futuro', () => {
      expect(parseConsent('ng_consent=v1.denied.1767225600', NOW - 86_400)).toEqual(ok(false));
    });
    it('rechaza más de 1 día en el futuro', () => {
      expect(parseConsent('ng_consent=v1.denied.1767225600', NOW - 86_401)).toBeNull();
    });
  });

  describe('versión', () => {
    it('versión menor que la mínima: null', () => {
      expect(parseConsent('ng_consent=v1.granted.1767225600', NOW, 2)).toBeNull();
    });
    it('versión igual o mayor: válida', () => {
      expect(parseConsent('ng_consent=v2.granted.1767225600', NOW, 2)).toEqual({ version: 2, analytics: true, savedAt: NOW });
      expect(parseConsent('ng_consent=v7.denied.1767225600', NOW)).toEqual({ version: 7, analytics: false, savedAt: NOW });
    });
  });
});

describe('needsPrompt', () => {
  it('pregunta solo sin decisión válida', () => {
    expect(needsPrompt(null)).toBe(true);
    expect(needsPrompt(ok(false))).toBe(false);
    expect(needsPrompt(ok(true))).toBe(false);
  });
});

describe('serializeConsent', () => {
  it('escribe exactamente los atributos del contrato', () => {
    expect(serializeConsent(true, NOW, { secure: true })).toBe(
      'ng_consent=v1.granted.1767225600; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
    expect(serializeConsent(false, NOW, { secure: true })).toBe(
      'ng_consent=v1.denied.1767225600; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
  });
  it('omite Secure si se pide, y nunca emite Domain', () => {
    const s = serializeConsent(true, NOW, { secure: false });
    expect(s).toBe('ng_consent=v1.granted.1767225600; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(s).not.toMatch(/Domain|Secure|Expires/i);
  });
  it('trunca los segundos fraccionarios', () => {
    expect(serializeConsent(true, NOW + 0.9, { secure: true })).toContain('v1.granted.1767225600;');
  });
  it('lo escrito se lee de vuelta (ida y vuelta)', () => {
    for (const a of [true, false]) {
      const pair = serializeConsent(a, NOW, { secure: true }).split(';')[0]!;
      expect(parseConsent(pair, NOW)).toEqual(ok(a));
    }
  });
});

describe('useSecureAttribute', () => {
  it.each([
    ['https:', 'nandogomez.com', true],
    ['https:', 'localhost', true],
    ['http:', 'nandogomez.com', true],
    ['http:', 'localhost', false],
    ['http:', '127.0.0.1', false],
    ['http:', 'localhost.evil.com', true],
  ])('%s %s -> %s', (protocol, hostname, expected) => {
    expect(useSecureAttribute(protocol, hostname)).toBe(expected);
  });
});

describe('gaCookiesToClear', () => {
  it('lista _ga y _ga_* presentes, sin duplicados', () => {
    expect(gaCookiesToClear('a=1; _ga=GA1.1.2; _ga_ABC123=x; _ga_ABC123=y; _ga_Z=q')).toEqual(['_ga', '_ga_ABC123', '_ga_Z']);
  });
  it('ignora otras cookies y nombres parecidos', () => {
    expect(gaCookiesToClear('')).toEqual([]);
    expect(gaCookiesToClear('ng_consent=v1.granted.1767225600; _gat=1; x_ga=1; _gaX=1; _gid=2; junk; =v')).toEqual([]);
  });
});

describe('expireCookieWrites', () => {
  const base = '_ga=; Max-Age=0; Path=/';
  it('nandogomez.com: sin Domain, host completo y .nandogomez.com', () => {
    expect(expireCookieWrites('_ga', 'nandogomez.com')).toEqual([
      base,
      `${base}; Domain=nandogomez.com`,
      `${base}; Domain=.nandogomez.com`,
    ]);
  });
  it('www.nandogomez.com', () => {
    expect(expireCookieWrites('_ga', 'www.nandogomez.com')).toEqual([
      base,
      `${base}; Domain=www.nandogomez.com`,
      `${base}; Domain=.nandogomez.com`,
    ]);
  });
  it('x.pages.dev: nunca Domain=.pages.dev', () => {
    const w = expireCookieWrites('_ga', 'x.pages.dev');
    expect(w).toEqual([base, `${base}; Domain=x.pages.dev`]);
    expect(w.join('|')).not.toContain('Domain=.pages.dev');
    expect(w.join('|')).not.toContain('.nandogomez.com');
  });
  it('localhost', () => {
    expect(expireCookieWrites('_ga', 'localhost')).toEqual([base, `${base}; Domain=localhost`]);
  });
  it('no confunde dominios que solo terminan igual', () => {
    expect(expireCookieWrites('_ga', 'evilnandogomez.com')).toHaveLength(2);
    expect(expireCookieWrites('_ga', 'nandogomez.com.evil.io')).toHaveLength(2);
  });
  it('normaliza mayúsculas del hostname', () => {
    expect(expireCookieWrites('_ga', 'WWW.NandoGomez.com')).toHaveLength(3);
  });
});

describe('readConsent (cookies bloqueadas)', () => {
  it('lee con la función inyectada', () => {
    expect(readConsent(() => 'ng_consent=v1.granted.1767225600', NOW)).toEqual(ok(true));
  });
  it('si document.cookie lanza, devuelve null sin propagar', () => {
    expect(
      readConsent(() => {
        throw new DOMException('blocked', 'SecurityError');
      }, NOW),
    ).toBeNull();
  });
  it('si lo leído no es una cadena, devuelve null', () => {
    expect(readConsent((() => undefined) as unknown as () => string, NOW)).toBeNull();
  });
});

describe('writeConsent', () => {
  it('escribe la cadena serializada y devuelve true', () => {
    const writes: string[] = [];
    expect(writeConsent((s) => writes.push(s), true, NOW, { secure: true })).toBe(true);
    expect(writes).toEqual(['ng_consent=v1.granted.1767225600; Path=/; Max-Age=31536000; SameSite=Lax; Secure']);
  });
  it('si escribir lanza, devuelve false sin propagar', () => {
    expect(
      writeConsent(
        () => {
          throw new Error('blocked');
        },
        false,
        NOW,
        { secure: false },
      ),
    ).toBe(false);
  });
});

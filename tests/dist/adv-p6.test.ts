// Adversario P6 (actualizado en P7b): dist no contiene nada de Google (A6), salvo el cargador de GA
// dentro del JS del módulo de consentimiento, que P7b exige por plan (§4.3, §7).
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distFiles, read } from './helpers';

const google = /googletagmanager|google-analytics|analytics\.google|doubleclick|gtag\/js|ga-disable|data-ng-ga/i;
// Lo único de Google que nunca puede aparecer, ni siquiera en el JS del consentimiento.
const neverAnywhere = /google-analytics|analytics\.google|doubleclick/i;
const LOADER = 'https://www.googletagmanager.com/gtag/js?id=';

const textFiles = () => distFiles().filter((f) => /\.(html|css|js|mjs|txt|xml|json)$/.test(f));
const isJs = (f: string) => /\.m?js$/.test(f);
// El módulo de consentimiento se reconoce por su contenido, no por el nombre del chunk:
// usa el nombre de la cookie y el id del contenedor del marcado.
const isConsentJs = (f: string) => {
  if (!isJs(f) || !/[\\/]_astro[\\/]/.test(f)) return false;
  const src = read(f);
  return src.includes('ng_consent') && (src.includes('ng-consent') || src.includes('initConsentUi'));
};

describe('adv P6 · dist sin Google', () => {
  it('hay HTML que revisar', () => {
    expect(distFiles().filter((f) => f.endsWith('.html')).length).toBeGreaterThanOrEqual(5);
  });

  it('ningún HTML, CSS ni JS de dist referencia Google ni el cargador de GA (salvo el JS del consentimiento)', () => {
    const hits = textFiles()
      .filter((f) => !isConsentJs(f))
      .filter((f) => google.test(read(f)));
    expect(hits).toEqual([]);
  });

  it('el JS del consentimiento existe, está en /_astro/ y solo trae el cargador gtag/js de googletagmanager', () => {
    const consent = textFiles().filter(isConsentJs);
    expect(consent.length, 'no se encuentra el módulo de consentimiento en dist/_astro').toBeGreaterThanOrEqual(1);
    for (const f of consent) {
      const src = read(f);
      expect(neverAnywhere.test(src), basename(f)).toBe(false);
      const hosts = src.match(/[a-z0-9.-]*googletagmanager\.com[^`'"\s]*/gi) ?? [];
      expect(hosts.length, basename(f)).toBeGreaterThanOrEqual(1);
      for (const h of hosts) expect(`https://${h}`, basename(f)).toBe(LOADER);
    }
  });

  it('ningún HTML ni CSS menciona el cargador, ga-disable ni data-ng-ga', () => {
    const hits = textFiles()
      .filter((f) => /\.(html|css)$/.test(f))
      .filter((f) => google.test(read(f)));
    expect(hits).toEqual([]);
  });
});

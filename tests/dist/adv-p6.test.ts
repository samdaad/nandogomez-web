// Adversario P6: P6 no cablea UI; dist no debe contener nada de Google (A6).
import { describe, expect, it } from 'vitest';
import { distFiles, read } from './helpers';

const google = /googletagmanager|google-analytics|analytics\.google|doubleclick|gtag\/js|ga-disable|data-ng-ga/i;

describe('adv P6 · dist sin Google', () => {
  it('hay HTML que revisar', () => {
    expect(distFiles().filter((f) => f.endsWith('.html')).length).toBeGreaterThanOrEqual(5);
  });

  it('ningún HTML, CSS ni JS de dist referencia Google ni el cargador de GA', () => {
    const hits = distFiles()
      .filter((f) => /\.(html|css|js|mjs|txt|xml|json)$/.test(f))
      .filter((f) => google.test(read(f)));
    expect(hits).toEqual([]);
  });
});

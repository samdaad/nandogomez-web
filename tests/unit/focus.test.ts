import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string): string => readFileSync(join(import.meta.dirname, '../../src', p), 'utf8');

describe('main:focus sin contorno (skip link) en un sitio común', () => {
  it('global.css lo define', () => {
    expect(src('styles/global.css')).toMatch(/main:focus\s*\{\s*outline\s*:\s*none\s*;?\s*\}/);
  });
  it('LegalLayout ya no lo define por su cuenta', () => {
    expect(src('layouts/LegalLayout.astro')).not.toMatch(/main:focus/);
  });
});

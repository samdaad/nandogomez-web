import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '../../src/lib/site';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

type Token = { name: string; value: string };
type Tokens = {
  color: { tokens: Token[] };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  size: { tokens: Token[] };
};
const json = JSON.parse(read('design/tokens.json')) as Tokens;
const all: Token[] = [...json.color.tokens, ...json.spacing.tokens, ...json.radius.tokens, ...json.size.tokens];
const css = read('src/styles/tokens.css');
const decl = (name: string): string | undefined =>
  new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim();

describe('A10 · tokens', () => {
  it('design/tokens.json define 24 tokens', () => {
    expect(all).toHaveLength(24);
  });

  it.each(all)('--$name está en tokens.css con su valor', ({ name, value }) => {
    const expected = value === '{bg}' ? 'var(--bg)' : value;
    expect(decl(name)?.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('define las dos familias tipográficas', () => {
    expect(decl('font-sans')).toBe('"Geist", system-ui, sans-serif');
    expect(decl('font-mono')).toBe('"Geist Mono", ui-monospace, monospace');
  });

  it('define las dos extensiones locales', () => {
    expect(decl('border-control')).toBe('#3a3d44');
    expect(decl('overlay')).toBe('rgba(14,15,17,.72)');
  });

  it('no hay hex fuera de tokens.css, salvo THEME_COLOR en site.ts', () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(css|ts|astro|mjs)$/.test(f)) files.push(p);
      }
    };
    walk(join(ROOT, 'src'));
    const offenders = files
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== 'src/styles/tokens.css')
      .flatMap((f) => {
        const text = read(f).replace(f === 'src/lib/site.ts' ? /THEME_COLOR\s*=\s*'#[0-9a-fA-F]{6}'/ : /$^/, '');
        return /#[0-9a-fA-F]{3,8}\b/.test(text) ? [f] : [];
      });
    expect(offenders).toEqual([]);
  });

  it('THEME_COLOR es igual al token bg', () => {
    expect(THEME_COLOR.toLowerCase()).toBe(decl('bg')?.toLowerCase());
  });
});

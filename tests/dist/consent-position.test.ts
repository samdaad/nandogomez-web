import { describe, expect, it } from 'vitest';
import { distFiles, read } from './helpers';

// Decisión de Nando (29/10/2026): el banner de cookies va abajo a la derecha
// para no tapar «Hablemos». En móvil estrecho ocupa el ancho con márgenes.
const css = distFiles()
  .filter((f) => /\/_astro\/.*\.css$/.test(f))
  .map(read)
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Cuerpos de los @media de ~600px: `(min-width: 600px)` o la forma minificada `(width>=600px)`. */
function wideBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /@media\s*\(\s*(?:min-width\s*:|width\s*>=)\s*(\d+)px\s*\)\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (Number(m[1]) < 560 || Number(m[1]) > 640) continue;
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0;
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

describe('banner de cookies · posición', () => {
  it('base: fixed, abajo, con márgenes laterales (móvil estrecho)', () => {
    const base = [...css.matchAll(/([^{}]*\.banner[^{}]*)\{([^{}]*)\}/g)].map((m) => m[2]!).join(';');
    expect(base).toMatch(/position:\s*fixed/);
    expect(base).toMatch(/bottom:\s*var\(--space-4\)/);
    expect(base).toMatch(/inset-inline:\s*var\(--space-4\)/);
  });
  it('a partir de ~600px se ancla a la derecha con el mismo margen y suelta el borde izquierdo', () => {
    const rule = wideBlocks(css)
      .flatMap((b) => [...b.matchAll(/([^{}]*\.banner[^{}]*)\{([^{}]*)\}/g)].map((m) => m[2]!))
      .join(';');
    expect(rule).toMatch(/(inset-inline-start|left)\s*:\s*auto/);
    expect(rule).not.toMatch(/(inset-inline-end|right)\s*:\s*(?!var\(--space-4\))[^;]+/);
    expect(rule).not.toMatch(/(?<![-\w])left\s*:\s*(?!auto)/);
  });
});

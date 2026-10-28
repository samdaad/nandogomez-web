// Adversario P4, ronda 3: casos realistas de esta web fijados en verde (regresión).
import { describe, expect, it } from 'vitest';
import { findPendingInHtml } from '../../scripts/lib/release-check.mjs';

const page = (body: string, head = '') => `<!doctype html><html lang="es"><head><title>t</title>${head}</head><body>${body}</body></html>`;
const found = (body: string, head = '') => findPendingInHtml(page(body, head));

describe('ronda 3: casos realistas (verde)', () => {
  it('banner de cookies en <dialog> (abierto o cerrado) y texto de <button>', () => {
    expect(found('<dialog id="ng-consent"><p>Usamos [TEXTO PEND] cookies</p><button>Aceptar</button></dialog>')).toEqual(['[TEXTO PEND]']);
    expect(found('<dialog open><h2>[TITULO PEND]</h2><button>[ACEPTAR PEND]</button></dialog>')).toEqual(['[TITULO PEND]', '[ACEPTAR PEND]']);
  });
  it('fecha dentro de <time>, Registro en <dd>, _ga_[ID] en <td><code>', () => {
    expect(found('<p class="updated">Última actualización: <time>[FECHA DE PUBLICACIÓN]</time></p>')).toEqual(['[FECHA DE PUBLICACIÓN]']);
    expect(found('<dl><dt>Registro Mercantil</dt><dd>[Registro Mercantil de Barcelona, tomo]</dd></dl>')).toEqual(['[Registro Mercantil de Barcelona, tomo]']);
    expect(found('<table><tr><td><code>_ga_[ID]</code></td></tr></table>')).toEqual(['[ID]']);
  });
  it('noscript con elementos, en body y en head', () => {
    expect(found('<noscript><p class="x">Sin JS [PEND X] <a href="/c">aquí</a></p></noscript>')).toEqual(['[PEND X]']);
    expect(found('<p>ok</p>', '<noscript><style>a{}</style><p>[HEAD PEND]</p></noscript>')).toEqual(['[HEAD PEND]']);
  });
  it('contenido de respaldo de <object>/<video> cuenta', () => {
    expect(found('<object data="x.pdf"><p>[FALLBACK PEND]</p></object><video><p>[VIDEO PEND]</p></video>')).toHaveLength(2);
  });
});

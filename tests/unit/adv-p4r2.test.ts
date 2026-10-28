// Adversario P4, ronda 2 (implementación con parse5). [ROJO] = dist trampa con un pendiente visible que hoy
// pasa `--strict` con salida 0. Intocables por el coder: se arreglan en scripts/lib/release-check.mjs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { findPendingInHtml } from '../../scripts/lib/release-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/check-release.mjs');
const GA = 'G-ABC123XYZ9';
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function dist(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'adv-p4r2-'));
  dirs.push(d);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), body);
  }
  return d;
}
const page = (body: string, head = '') =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;
function strict(d: string) {
  const e: Record<string, string | undefined> = { ...process.env, PUBLIC_GA_ID: GA, RELEASE_STRICT: undefined };
  delete e['RELEASE_STRICT'];
  return spawnSync(process.execPath, [CLI, `--dist=${d}`, '--strict'], { encoding: 'utf8', env: e as NodeJS.ProcessEnv }).status;
}
const mustFail = (html: string) => expect(strict(dist({ 'index.html': page('<p>ok</p>'), 'cookies.html': html }))).toBe(1);

describe('[ROJO] ronda 2: falsos negativos vivos', () => {
  it('[ROJO] <noscript> se parsea como texto crudo: &#91;…&#93; no se decodifica y el visitante sin JS ve [ACTIVA JS]', () => {
    // parse5 usa scriptingEnabled=true por defecto; la página /cookies tiene un <noscript>.
    mustFail(page('<noscript><p>&#91;ACTIVA JS&#93;</p></noscript>'));
    mustFail(page('<p>ok</p>', '<noscript>&#x5B;PENDIENTE EN HEAD&#x5D;</noscript>'));
  });
  it('[ROJO] elementos en línea fuera de la lista INLINE cortan el corchete (label, img, svg, button, custom elements como astro-island)', () => {
    mustFail(page('<p>[FECHA <label>DE</label> PUBLICACIÓN]</p>'));
    mustFail(page('<p>[FECHA DE<img src="/x.png" alt=""> PUBLICACIÓN]</p>'));
    mustFail(page('<p>[FECHA <svg width="8" height="8"><path d="M0 0"/></svg> DE PUBLICACIÓN]</p>'));
    mustFail(page('<p>[FECHA DE <astro-island>PUBLICACIÓN</astro-island>]</p>'));
  });
  it('[ROJO] texto visible en atributos no listados: iframe srcdoc, optgroup label, option label', () => {
    mustFail(page('<iframe srcdoc="<p>[FECHA DE PUBLICACIÓN]</p>"></iframe>'));
    mustFail(page('<select><optgroup label="[GRUPO PENDIENTE]"><option>a</option></optgroup></select>'));
    mustFail(page('<select><option label="[OPCION PENDIENTE]" value="v">x</option></select>'));
  });
});

describe('ronda 2: casos que ya funcionan (verde)', () => {
  const found = (body: string, head = '') => findPendingInHtml(page(body, head));
  it('corchete que cruza inline anidado profundo', () => {
    expect(found('<p>[FECHA <span><em><b><a href="/x"><i>DE</i></a></b></em></span> PUBLICACIÓN]</p>')).toEqual(['[FECHA DE PUBLICACIÓN]']);
  });
  it('<select>/<option> con texto, input submit con value', () => {
    expect(found('<select><option>[OPCION PEND]</option></select><input type="submit" value="[ENVIAR PEND]">')).toEqual([
      '[OPCION PEND]',
      '[ENVIAR PEND]',
    ]);
  });
  it('hidden / aria-hidden / display:none cuentan (prudente)', () => {
    expect(found('<p hidden>[AA]</p><p aria-hidden="true">[BB]</p><p style="display:none">[CC]</p>')).toHaveLength(3);
  });
  it('entidades raras con ceros y sin punto y coma', () => {
    expect(found('<p>&#x005B;AA&#x005D; &#0091;BB&#0093; &#91CC&#93</p>')).toEqual(['[AA]', '[BB]', '[CC]']);
  });
  it('svg title/desc, math, template anidado, style sin cerrar', () => {
    expect(found('<svg><title>[AA]</title><desc>[BB]</desc></svg><math><mi>[CC]</mi></math>')).toHaveLength(3);
    expect(found('<template><template><p>[DD]</p></template></template>')).toEqual(['[DD]']);
    expect(found('<style>a{}<p>[EE]</p>')).toContain('[EE]');
  });
  it('un pendiente solo en og:description de una página de varias hace fallar el estricto', () => {
    expect(strict(dist({ 'a.html': page('<p>ok</p>'), 'sub/b.html': page('<p>ok</p>', '<meta property="og:description" content="[DATO PENDIENTE]">') }))).toBe(1);
  });
  it('rendimiento: ~5 MB de HTML en menos de 10 s; entradas patológicas (<a, <!--, <script repetidos) rápidas', () => {
    let t = Date.now();
    findPendingInHtml(page('<p>texto normal con [ ] y cosas</p>'.repeat(150000)));
    expect(Date.now() - t).toBeLessThan(10000);
    t = Date.now();
    for (const s of ['<a'.repeat(100000), '<!--'.repeat(50000), '<script>'.repeat(20000)]) findPendingInHtml(s);
    expect(Date.now() - t).toBeLessThan(10000);
  }, 30000);
});

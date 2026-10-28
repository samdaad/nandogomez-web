// Adversario P4 (check:release). Los tests marcados [ROJO] demuestran falsos negativos: un dist trampa
// con un pendiente que el visitante ve (o Google indexa) y que hoy pasa `--strict` con salida 0.
// Son intocables por el coder: se arreglan cambiando scripts/lib/release-check.mjs, no estos tests.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { findPendingInHtml, scanDist } from '../../scripts/lib/release-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/check-release.mjs');
const GA = 'G-ABC123XYZ9';
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function dist(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'adv-p4-'));
  dirs.push(d);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), body);
  }
  return d;
}
const page = (body: string, head = '') =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;

function env(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const e: Record<string, string | undefined> = { ...process.env, PUBLIC_GA_ID: undefined, RELEASE_STRICT: undefined, ...extra };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e as NodeJS.ProcessEnv;
}
function strict(d: string) {
  const r = spawnSync(process.execPath, [CLI, `--dist=${d}`, '--strict'], { encoding: 'utf8', env: env({ PUBLIC_GA_ID: GA }) });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}
/** Un dist trampa con UNA página que contiene el pendiente: en estricto debe fallar. */
const mustFail = (html: string) => expect(strict(dist({ 'aviso-legal.html': html })).status).toBe(1);

describe('[ROJO] falsos negativos en texto visible', () => {
  it('[ROJO] corchete partido por etiquetas en línea: el visitante lee "[FECHA DE PUBLICACIÓN]"', () => {
    mustFail(page('<p>Última actualización: [FECHA <b>DE</b> PUBLICACIÓN]</p>'));
  });
  it('[ROJO] "<!--" dentro de un string de <script> se come el texto visible hasta el siguiente "-->"', () => {
    // El navegador NO abre comentario dentro de <script>; el checker quita comentarios antes que scripts.
    mustFail(page('<script>var s = "<!--";</script><p>Última actualización: [FECHA DE PUBLICACIÓN]</p><!-- nota -->'));
  });
  it('[ROJO] "<script>" literal dentro de un atributo oculta el texto visible hasta el siguiente </script>', () => {
    mustFail(page('<a title="<script>" href="/x">x</a><p>[FECHA DE PUBLICACIÓN]</p><script>1</script>'));
  });
  it('[ROJO] etiqueta de cierre con atributos "</script x>" (el navegador cierra ahí el script)', () => {
    mustFail(page('<script>1</script x><p>[FECHA DE PUBLICACIÓN]</p><script>2</script>'));
  });
  it('[ROJO] referencias numéricas sin punto y coma: &#91FECHA&#93 se ve como [FECHA]', () => {
    mustFail(page('<p>&#91FECHA DE PUBLICACIÓN&#93</p>'));
  });
});

describe('[ROJO] falsos negativos en atributos que el visitante ve o Google indexa', () => {
  it('[ROJO] meta description (snippet de Google)', () => {
    mustFail(page('<p>ok</p>', '<meta name="description" content="Aviso legal. Actualizado [FECHA DE PUBLICACIÓN]">'));
  });
  it('[ROJO] og:description / twitter (vista previa al compartir)', () => {
    mustFail(page('<p>ok</p>', '<meta property="og:description" content="[Registro Mercantil de Barcelona]">'));
  });
  it('[ROJO] alt de imagen', () => {
    mustFail(page('<img src="/x.png" alt="[FOTO PENDIENTE]">'));
  });
  it('[ROJO] title (tooltip visible)', () => {
    mustFail(page('<abbr title="[Registro Mercantil pendiente]">RM</abbr>'));
  });
  it('[ROJO] placeholder y value de un input visible', () => {
    mustFail(page('<input placeholder="[EMAIL PENDIENTE]">'));
    mustFail(page('<input type="text" value="[DATO PENDIENTE]">'));
  });
});

describe('casos que ya funcionan (verde)', () => {
  const found = (body: string, head = '') => findPendingInHtml(page(body, head));
  it('entidades con punto y coma: decimal, hex, nombradas y en mayúsculas', () => {
    expect(found('<p>&#91;AA&#93; &#x5B;BB&#x5D; &lbrack;CC&rsqb; &LSQB;DD&RSQB;</p>')).toEqual(['[AA]', '[BB]', '[CC]', '[DD]']);
  });
  it('nbsp (literal o entidad) dentro del corchete', () => {
    expect(found('<p>[FECHA&nbsp;DE] [OTRA COSA]</p>')).toHaveLength(2);
  });
  it('<title>, noscript, svg <text>, <template>, <textarea>', () => {
    expect(findPendingInHtml('<html><head><title>[TITULO PEND]</title></head></html>')).toEqual(['[TITULO PEND]']);
    expect(found('<noscript>[AA]</noscript><svg><text>[BB]</text></svg><template>[CC]</template><textarea>[DD]</textarea>')).toHaveLength(4);
  });
  it('<SCRIPT> en mayúsculas, </script > con espacio, <style> dentro de svg: no ocultan el texto posterior', () => {
    expect(found('<SCRIPT>a[1]</SCRIPT><p>[AA]</p>')).toEqual(['[AA]']);
    expect(found('<script>a[1]</script ><p>[AA]</p>')).toEqual(['[AA]']);
    expect(found('<script>a[1]</script\n><p>[AA]</p>')).toEqual(['[AA]']);
    expect(found('<svg><style>.a[b]{}</style><text>[AA]</text></svg>')).toEqual(['[AA]']);
  });
  it('<script> sin cerrar no oculta lo posterior (falla del lado seguro)', () => {
    expect(found('<script>var a = 1;<p>[AA]</p>')).toContain('[AA]');
  });
  it('<!--> y <!---> son comentarios vacíos: el texto posterior se ve y se detecta', () => {
    expect(found('<!--><p>[AA]</p>')).toEqual(['[AA]']);
    expect(found('<!---><p>[AA]</p>')).toEqual(['[AA]']);
  });
  it('"-- >" no cierra el comentario (igual que el navegador)', () => {
    expect(found('<!-- a -- ><p>[AA]</p> -->')).toEqual([]);
  });
  it('sin falsos positivos: JSON-LD, style con selectores de atributo, comentarios', () => {
    expect(
      found('<p>ok</p>', '<script type="application/ld+json">{"a":["xx","yy"],"b":"[ZZ]"}</script><style>a[href^="x"]{}</style><!-- [TODO] -->'),
    ).toEqual([]);
  });
  it('subdirectorios y 404.html cuentan', () => {
    const d = dist({ '404.html': page('<p>[AA]</p>'), 'a/b/c.html': page('<p>[BB]</p>') });
    expect(scanDist(d, { gaId: GA }).pending.map((p) => p.page)).toEqual(['404.html', 'a/b/c.html']);
  });
});

describe('CLI: modo estricto y GA ID', () => {
  const dirty = () => dist({ 'index.html': page('<p>[FECHA DE PUBLICACIÓN]</p>') });
  it('RELEASE_STRICT=1 falla; "1 ", " 1", "TRUE" no son estrictos (contrato del plan: solo "1")', () => {
    const run = (v: string) =>
      spawnSync(process.execPath, [CLI, `--dist=${dirty()}`], { encoding: 'utf8', env: env({ PUBLIC_GA_ID: GA, RELEASE_STRICT: v }) }).status;
    expect(run('1')).toBe(1);
    for (const v of ['1 ', ' 1', 'TRUE', 'on']) expect(run(v)).toBe(0);
  });
  it('la cadena de "build" de package.json propaga el fallo en estricto (astro build sustituido por true)', () => {
    const build: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.build;
    expect(build.startsWith('astro build && ')).toBe(true);
    const chain = `${build.replace(/^astro build/, 'true')} --dist=${dirty()}`;
    const r = spawnSync('sh', ['-c', chain], { cwd: ROOT, encoding: 'utf8', env: env({ PUBLIC_GA_ID: GA, RELEASE_STRICT: '1' }) });
    expect(r.status).toBe(1);
    const warn = spawnSync('sh', ['-c', chain], { cwd: ROOT, encoding: 'utf8', env: env({ PUBLIC_GA_ID: GA }) });
    expect(warn.status).toBe(0);
  });
  it('GA ID inválidos fallan en estricto: vacío, espacios, minúsculas, "G-", inyección, salto de línea', () => {
    const d = dist({ 'index.html': page('<p>limpio</p>') });
    for (const v of ['', '   ', 'g-abc123xyz9', 'G-', 'G-ABC"><script>', 'G-ABCD1234\nG-X', 'G-ABC']) {
      const r = spawnSync(process.execPath, [CLI, `--dist=${d}`, '--strict'], { encoding: 'utf8', env: env({ PUBLIC_GA_ID: v }) });
      expect(r.status, JSON.stringify(v)).toBe(1);
    }
  });
  it('dist inexistente falla en estricto', () => {
    expect(strict(join(tmpdir(), 'adv-p4-no-existe-xyz')).status).toBe(1);
  });
});

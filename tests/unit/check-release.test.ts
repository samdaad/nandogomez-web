import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { findPendingInHtml, isValidGaId, scanDist, visibleTextNodes } from '../../scripts/lib/release-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/check-release.mjs');
const VALID_GA = 'G-ABC123XYZ9';
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture(pages: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'check-release-'));
  dirs.push(d);
  for (const [rel, html] of Object.entries(pages)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), html);
  }
  return d;
}
const page = (body: string, head = '') => `<!doctype html><html lang="es"><head><title>t</title>${head}</head><body>${body}</body></html>`;

function cli(dist: string, args: string[], env: Record<string, string | undefined>) {
  const e: Record<string, string | undefined> = { ...process.env, PUBLIC_GA_ID: undefined, RELEASE_STRICT: undefined, NO_COLOR: '1', ...env };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  const r = spawnSync(process.execPath, [CLI, `--dist=${dist}`, ...args], { encoding: 'utf8', env: e as NodeJS.ProcessEnv });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('isValidGaId', () => {
  it('acepta G-XXXX y rechaza vacío, espacios o formas raras', () => {
    expect(isValidGaId(VALID_GA)).toBe(true);
    expect(isValidGaId(` ${VALID_GA}\n`)).toBe(true); // trim, igual que CookieTable
    for (const v of [undefined, '', '  ', 'G-', 'G-abc', 'UA-123456', 'G-ABC<script>']) expect(isValidGaId(v)).toBe(false);
  });
});

describe('visibleTextNodes / findPendingInHtml', () => {
  it('detecta un corchete pendiente en texto visible', () => {
    expect(findPendingInHtml(page('<p>Actualizado: [FECHA DE PUBLICACIÓN]</p>'))).toEqual(['[FECHA DE PUBLICACIÓN]']);
  });
  it('ignora script y style', () => {
    const html = page('<script>const a = [1, 2];</script><style>a[href]{color:red}</style><p>ok</p>');
    expect(findPendingInHtml(html)).toEqual([]);
  });
  it('ignora comentarios y atributos no visibles (data-*, href, src, class, id)', () => {
    const html = page('<!-- [TODO nota] --><a href="/[x1]" data-x="[abc]" class="[cl]" id="[id]">ok</a><img src="/[im]" alt="ok">');
    expect(findPendingInHtml(html)).toEqual([]);
  });
  it('cuenta aria-label, alt, title, placeholder y value', () => {
    expect(findPendingInHtml(page('<a href="/x" aria-label="[pendiente]">ok</a>'))).toEqual(['[pendiente]']);
  });
  it('un > dentro de un atributo no rompe el recorrido de texto', () => {
    expect(findPendingInHtml(page('<a title="a > b" href="/x">[PENDIENTE X]</a>'))).toEqual(['[PENDIENTE X]']);
  });
  it('mira el texto dentro de noscript (lo ve quien no tiene JS)', () => {
    expect(findPendingInHtml(page('<noscript>[ACTIVA JS]</noscript>'))).toEqual(['[ACTIVA JS]']);
  });
  it('decodifica entidades: &#91;…&#93; también es un corchete visible', () => {
    expect(findPendingInHtml(page('<p>&#91;DATO&#93; y &lbrack;OTRO&rbrack;</p>'))).toEqual(['[DATO]', '[OTRO]']);
  });
  it('no marca corchetes de un solo carácter ni vacíos; un salto de línea dentro se colapsa a un espacio', () => {
    expect(findPendingInHtml(page('<p>[] [a] [uno\ndos]</p>'))).toEqual(['[uno dos]']);
    expect(findPendingInHtml(page('<p>[uno</p><p>dos]</p>'))).toEqual([]);
  });
  it('devuelve varios pendientes en orden', () => {
    expect(findPendingInHtml(page('<p>[UNO] texto</p><p>[DOS]</p>'))).toEqual(['[UNO]', '[DOS]']);
  });
  it('visibleTextNodes no incluye contenido de script/style', () => {
    const t = visibleTextNodes(page('<p>hola</p><script>x[1]</script>')).join('|');
    expect(t).toContain('hola');
    expect(t).not.toContain('x[1]');
  });
});

describe('scanDist', () => {
  it('lista cada pendiente con su página (ruta relativa a dist, también en subcarpetas) y el texto', () => {
    const d = fixture({
      'a.html': page('<p>[FECHA]</p>'),
      'sub/b.html': page('<p>ok</p><p>[REGISTRO X]</p>'),
      'c.html': page('<p>limpio</p>'),
      'notas.txt': '[ignorado]',
    });
    const r = scanDist(d, { gaId: VALID_GA });
    expect(r.pending).toEqual([
      { page: 'a.html', text: '[FECHA]' },
      { page: 'sub/b.html', text: '[REGISTRO X]' },
    ]);
    expect(r.gaIdValid).toBe(true);
    expect(r.ok).toBe(false);
  });
  it('ok solo si no hay pendientes y el GA ID es válido', () => {
    const d = fixture({ 'a.html': page('<p>limpio</p>') });
    expect(scanDist(d, { gaId: VALID_GA }).ok).toBe(true);
    expect(scanDist(d, { gaId: '' }).ok).toBe(false);
    expect(scanDist(d, { gaId: undefined }).gaIdValid).toBe(false);
  });
});

describe('CLI check-release', () => {
  const dirty = () => fixture({ 'index.html': page('<p>[FECHA DE PUBLICACIÓN]</p>'), 'sub/x.html': page('<p>[OTRO]</p>') });
  const clean = () => fixture({ 'index.html': page('<p>todo listo</p>') });

  it('modo aviso (sin RELEASE_STRICT): lista pendientes con página y termina con 0', () => {
    const r = cli(dirty(), [], { PUBLIC_GA_ID: VALID_GA });
    expect(r.status).toBe(0);
    expect(r.out).toContain('index.html');
    expect(r.out).toContain('[FECHA DE PUBLICACIÓN]');
    expect(r.out).toContain('sub/x.html');
    expect(r.out).toContain('[OTRO]');
  });
  it('RELEASE_STRICT distinto de "1" sigue siendo modo aviso', () => {
    for (const v of ['', '0', 'true', 'yes']) expect(cli(dirty(), [], { PUBLIC_GA_ID: VALID_GA, RELEASE_STRICT: v }).status).toBe(0);
  });
  it('RELEASE_STRICT=1: termina con 1 y sigue listando pendientes', () => {
    const r = cli(dirty(), [], { PUBLIC_GA_ID: VALID_GA, RELEASE_STRICT: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('index.html');
    expect(r.out).toContain('[FECHA DE PUBLICACIÓN]');
  });
  it('--strict equivale a RELEASE_STRICT=1', () => {
    expect(cli(dirty(), ['--strict'], { PUBLIC_GA_ID: VALID_GA }).status).toBe(1);
  });
  it('sin PUBLIC_GA_ID válido: aviso en modo normal (0) y error en estricto (1)', () => {
    const normal = cli(clean(), [], {});
    expect(normal.status).toBe(0);
    expect(normal.out).toContain('PUBLIC_GA_ID');
    const bad = cli(clean(), ['--strict'], { PUBLIC_GA_ID: 'no-valido' });
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('PUBLIC_GA_ID');
  });
  it('limpio + GA válido: 0 en ambos modos', () => {
    expect(cli(clean(), ['--strict'], { PUBLIC_GA_ID: VALID_GA }).status).toBe(0);
    expect(cli(clean(), [], { PUBLIC_GA_ID: VALID_GA }).status).toBe(0);
  });
  it('dist sin ningún .html es un problema (error en estricto, aviso en normal)', () => {
    const d = fixture({ 'notas.txt': 'nada' });
    expect(cli(d, ['--strict'], { PUBLIC_GA_ID: VALID_GA }).status).toBe(1);
    expect(cli(d, [], { PUBLIC_GA_ID: VALID_GA }).status).toBe(0);
  });
  it('--dist vacío o sin "=" da un error claro (2)', () => {
    for (const a of ['--dist=', '--dist']) {
      const r = spawnSync(process.execPath, [CLI, a], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('--dist');
    }
  });
  it('entrada patológica no cuelga (sin backtracking)', () => {
    const t = Date.now();
    findPendingInHtml('<a'.repeat(100000));
    expect(Date.now() - t).toBeLessThan(1000);
  });
  it('dist inexistente: error en estricto, aviso (0) en modo normal', () => {
    const missing = join(tmpdir(), 'check-release-no-existe');
    expect(cli(missing, ['--strict'], { PUBLIC_GA_ID: VALID_GA }).status).toBe(1);
    expect(cli(missing, [], { PUBLIC_GA_ID: VALID_GA }).status).toBe(0);
  });
});

describe('package.json', () => {
  it('cablea check:release (estricto) y el build encadenado', async () => {
    const { readFileSync } = await import('node:fs');
    const sc = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
    expect(sc['check:release']).toBe('node scripts/check-release.mjs --strict');
    expect(sc['build']).toBe('astro build && node scripts/check-release.mjs');
  });
});

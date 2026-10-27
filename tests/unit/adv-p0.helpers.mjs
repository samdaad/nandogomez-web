// Acceso a Node para adv-p0.test.ts. Va en .mjs porque P0 no instala @types/node
// y tsconfig incluye **/*: un .ts que importe node:* rompe `npm run typecheck`.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} p @returns {string} */
export const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** @param {string} p @returns {boolean} */
export const exists = (p) => existsSync(join(ROOT, p));

/** @param {string} p @returns {Promise<any>} */
export const importFromRoot = (p) => import(pathToFileURL(join(ROOT, p)).href);

/** @type {string[]} */
const tmpDirs = [];

/** Copia mínima del proyecto con node_modules enlazado. @returns {string} */
export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'adv-p0-'));
  tmpDirs.push(dir);
  for (const p of ['astro.config.mjs', 'tsconfig.json', 'package.json', 'src']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/** @param {string} dir @param {string} rel @param {string} content */
export const writeIn = (dir, rel, content) => writeFileSync(join(dir, rel), content);

/** @param {string} dir @param {string} rel @returns {string | null} */
export const readIn = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : null);

/**
 * Ejecuta un script de npm en `dir`. `dropEnv` elimina variables del entorno.
 * @param {string} dir @param {string} script @param {string[]} [dropEnv]
 * @returns {{ status: number | null, output: string }}
 */
export function npmRun(dir, script, dropEnv = []) {
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' };
  for (const k of dropEnv) delete env[k];
  const r = spawnSync('npm', ['run', '--silent', script], { cwd: dir, encoding: 'utf8', env });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

export function cleanup() {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

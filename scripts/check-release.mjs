// check:release (PLAN §4.5): pendientes `[…]` en el texto visible de dist/ y PUBLIC_GA_ID válido.
// Estricto con --strict o RELEASE_STRICT=1 (sale con 1); si no, solo avisa y sale con 0.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDist } from './lib/release-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict') || process.env['RELEASE_STRICT'] === '1';
if (args.includes('--dist')) {
  console.error('check:release: uso incorrecto, --dist necesita valor: --dist=<carpeta>.');
  process.exit(2);
}
const distArg = args.find((a) => a.startsWith('--dist='));
if (distArg !== undefined && distArg.slice(7).trim() === '') {
  console.error('check:release: uso incorrecto, --dist= está vacío: --dist=<carpeta>.');
  process.exit(2);
}
const dist = distArg ? resolve(distArg.slice(7)) : join(root, 'dist');

const r = scanDist(dist, { gaId: process.env['PUBLIC_GA_ID'] });
const label = strict ? 'ERROR' : 'AVISO';
const lines = [];
if (!r.distFound) lines.push(`${label} no existe ${dist}: ejecuta primero el build.`);
if (r.distFound && r.htmlCount === 0) lines.push(`${label} ${dist} no contiene ningún .html.`);
for (const p of r.pending) lines.push(`${label} pendiente en ${p.page}: ${p.text}`);
if (!r.gaIdValid) lines.push(`${label} PUBLIC_GA_ID vacío o inválido (se espera G-XXXXXXXX).`);

if (r.ok) {
  console.log('check:release: sin pendientes y con PUBLIC_GA_ID válido.');
} else {
  console.log(lines.join('\n'));
  console.log(`check:release: ${lines.length} problema(s), modo ${strict ? 'estricto: el build falla' : 'aviso: el build sigue'}.`);
}
process.exit(strict && !r.ok ? 1 : 0);

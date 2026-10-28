// Tests del adversario para P0 (bootstrap). Regresión: no se modifican ni se borran.
// Cubren lo que P0 promete en docs/PLAN.md: §8 P0, §2 A1, §3 (config), §9.1 (CI) y
// la tabla «Versiones fijadas exactas».
// Son compatibles con P1–P11: comprueban lo que P0 fija y lo que debe seguir siendo cierto,
// no una lista cerrada (los pasos siguientes añaden paquetes, scripts, integraciones y exports).
import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, importFromRoot, npmRun, read, readIn, sandbox, writeIn } from './adv-p0.helpers.mjs';

const readJson = <T>(p: string): T => JSON.parse(read(p)) as T;

type Pkg = {
  name?: string;
  private?: boolean;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
type Lock = {
  lockfileVersion: number;
  packages: Record<string, { version?: string; resolved?: string; integrity?: string; link?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
};

const plan = read('docs/PLAN.md');
const pkg = readJson<Pkg>('package.json');
const lock = readJson<Lock>('package-lock.json');
const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
const P0_DEPS = ['@astrojs/check', 'astro', 'typescript', 'vitest'] as const;

// Tabla de versiones de PLAN.md: | `nombre` | versión | nota |
function planVersions(): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of plan.split('\n')) {
    const r = /^\| `([^`]+)` \| \*{0,2}(\d+\.\d+\.\d+)\*{0,2} \|/.exec(line);
    if (r?.[1] && r[2]) m.set(r[1], r[2]);
  }
  return m;
}

describe('P0 · package.json', () => {
  it('los 4 paquetes de P0 están con su versión exacta del plan', () => {
    const table = planVersions();
    for (const name of P0_DEPS) {
      expect(allDeps[name], name).toBeDefined();
      expect(allDeps[name], `${name} frente a PLAN.md`).toBe(table.get(name));
    }
  });

  it('TODA dependencia (dependencies y devDependencies) usa versión exacta (sin ^, ~, *, rangos, tags ni URLs)', () => {
    for (const [name, v] of Object.entries(allDeps)) {
      expect(v, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('todo paquete que figure en la tabla del plan usa exactamente esa versión', () => {
    const table = planVersions();
    expect(table.size).toBeGreaterThanOrEqual(11);
    for (const [name, v] of Object.entries(allDeps)) {
      const planned = table.get(name);
      if (planned !== undefined) expect(v, `${name} frente a PLAN.md`).toBe(planned);
    }
  });

  it('typescript es 6.x (no 7.x: @astrojs/check no la admite)', () => {
    expect(allDeps['typescript']).toMatch(/^6\./);
  });

  it('los scripts de P0 existen con su valor (se permiten scripts adicionales)', () => {
    const sc = pkg.scripts ?? {};
    expect(sc['dev']).toBe('astro dev');
    expect(sc['preview']).toBe('astro preview');
    expect(sc['typecheck']).toBe('astro check --minimumFailingSeverity warning');
    // P4 encadena check-release (§4.5) y P5 añade --coverage (§8): se exige el prefijo de P0.
    expect(sc['build']).toMatch(/^astro build(?: && node scripts\/check-release\.mjs)?$/);
    expect(sc['test']).toMatch(/^vitest run(?: --coverage)?$/);
  });

  it('es un paquete privado ESM (no publicable por accidente)', () => {
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
  });
});

describe('P0 · package-lock.json (cadena de suministro)', () => {
  it('lockfile v3 y raíz sincronizada con package.json', () => {
    expect(lock.lockfileVersion).toBe(3);
    const root = lock.packages[''];
    expect({ ...root?.dependencies, ...root?.devDependencies }).toEqual(allDeps);
  });

  it('las versiones instaladas en el lock son las fijadas', () => {
    for (const [name, v] of Object.entries(allDeps)) {
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(v);
    }
  });

  it('todo paquete viene del registro oficial de npm y tiene integrity', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(lock.packages)) {
      if (!k || v.link) continue;
      if (!v.resolved?.startsWith('https://registry.npmjs.org/')) bad.push(`${k} resolved=${String(v.resolved)}`);
      if (!v.integrity?.startsWith('sha512-')) bad.push(`${k} integrity=${String(v.integrity)}`);
    }
    expect(bad).toEqual([]);
  });

  it('astro y vitest comparten la misma vite (sin copias anidadas propias)', () => {
    expect(lock.packages['node_modules/vite']?.version).toBeDefined();
    expect(lock.packages['node_modules/astro/node_modules/vite']).toBeUndefined();
    expect(lock.packages['node_modules/vitest/node_modules/vite']).toBeUndefined();
  });
});

describe('P0 · Node', () => {
  it('.node-version es exactamente 24.22.1 con un único salto de línea opcional', () => {
    expect(read('.node-version')).toMatch(/^24\.22\.1\n?$/);
  });

  it('.node-version satisface engines.node de astro', () => {
    const engines = readJson<{ engines: { node: string } }>('node_modules/astro/package.json').engines.node;
    const min = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(engines);
    expect(min, engines).not.toBeNull();
    const want = read('.node-version').trim().split('.').map(Number);
    const have = min!.slice(1).map(Number);
    const cmp = want[0]! - have[0]! || want[1]! - have[1]! || want[2]! - have[2]!;
    expect(cmp).toBeGreaterThanOrEqual(0);
  });
});

describe('P0 · configuración', () => {
  it('astro.config.mjs cumple §3 (las integraciones, p. ej. sitemap en P10, se permiten)', async () => {
    const mod = (await importFromRoot('astro.config.mjs')) as { default: Record<string, unknown> };
    const c = mod.default as {
      site?: string;
      trailingSlash?: string;
      build?: { format?: string; inlineStylesheets?: string };
      vite?: { build?: { assetsInlineLimit?: number } };
      output?: string;
    };
    expect(c.site).toBe('https://nandogomez.com');
    expect(c.trailingSlash).toBe('never');
    expect(c.build?.format).toBe('file');
    expect(c.build?.inlineStylesheets).toBe('never');
    expect(c.vite?.build?.assetsInlineLimit).toBe(0);
    expect(c.output ?? 'static').toBe('static');
  });

  it('tsconfig extiende astro/tsconfigs/strictest y excluye las salidas', () => {
    const ts = readJson<{ extends: string; include: string[]; exclude: string[] }>('tsconfig.json');
    expect(ts.extends).toBe('astro/tsconfigs/strictest');
    expect(ts.include).toEqual(expect.arrayContaining(['.astro/types.d.ts']));
    expect(ts.exclude).toEqual(expect.arrayContaining(['dist', 'dist-e2e', 'coverage']));
  });

  it('.gitignore contiene todo lo listado en §3', () => {
    const lines = read('.gitignore').split('\n').map((l) => l.trim());
    for (const e of ['node_modules', 'dist', 'dist-e2e', '.astro', 'coverage', 'test-results', 'playwright-report']) {
      expect(lines, e).toContain(e);
    }
  });

  it('vitest recoge tests/unit y no tests/dist (esos van con test:dist, tras el build)', async () => {
    const mod = (await importFromRoot('vitest.config.ts')) as { default: { test?: { include?: string[] } } };
    const inc = mod.default.test?.include ?? [];
    expect(inc).toContain('tests/unit/**/*.test.ts');
    expect(inc.some((g) => g.includes('tests/dist') || g.startsWith('**') || g.startsWith('tests/**'))).toBe(false);
  });
});

describe('P0 · CI', () => {
  const block = /### 9\.1[^\n]*\n```yaml\n([\s\S]*?)```/.exec(plan)?.[1];

  it('docs/ci.yml.txt es idéntico al bloque de §9.1 del plan', () => {
    expect(block).toBeDefined();
    expect(read('docs/ci.yml.txt')).toBe(block);
  });

  it('.github/workflows/ci.yml es idéntico byte a byte a docs/ci.yml.txt', () => {
    expect(read('.github/workflows/ci.yml')).toBe(read('docs/ci.yml.txt'));
  });

  it('ci.yml: permisos mínimos y puertas duras sin continue-on-error', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(ci).not.toMatch(/pull_request_target/);
    expect(ci).not.toMatch(/write/);
    // continue-on-error solo en los dos pasos informativos
    expect(ci.match(/continue-on-error: true/g)).toHaveLength(2);
    for (const gate of ['npm run typecheck', 'npm test', 'npm run build']) {
      const i = ci.indexOf(`run: ${gate}`);
      expect(i, gate).toBeGreaterThan(-1);
      const stepStart = ci.lastIndexOf('- ', i);
      expect(ci.slice(stepStart, i)).not.toMatch(/continue-on-error/);
    }
    expect(ci).toMatch(/node-version-file: \.node-version/);
    expect(ci).toMatch(/run: npm ci\n/);
  });
});

describe('P0 · código', () => {
  it('site.ts exporta SITE_URL y EMAIL, y SITE_URL es un origen https sin barra', async () => {
    const mod = (await import('../../src/lib/site')) as Record<string, unknown>;
    expect(Object.keys(mod)).toEqual(expect.arrayContaining(['EMAIL', 'SITE_URL']));
    const u = new URL(String(mod['SITE_URL']));
    expect(u.origin).toBe(mod['SITE_URL']);
    expect(u.protocol).toBe('https:');
    expect(String(mod['EMAIL']).endsWith(`@${u.hostname}`)).toBe(true);
  });

  it('SITE_URL de site.ts coincide con site de astro.config.mjs', async () => {
    const cfg = (await importFromRoot('astro.config.mjs')) as { default: { site?: string } };
    const { SITE_URL } = await import('../../src/lib/site');
    expect(cfg.default.site).toBe(SITE_URL);
  });
});

// ---- Integración: typecheck y build reales en una copia temporal del proyecto ----
afterAll(cleanup);

describe('P0 · integración (A1 y build)', () => {
  it('typecheck pasa en limpio', () => {
    const r = npmRun(sandbox(), 'typecheck');
    expect(r.status, r.output).toBe(0);
  }, 120_000);

  it('typecheck FALLA ante un error de tipos en un .ts', () => {
    const dir = sandbox();
    writeIn(dir, 'src/lib/bad.ts', "export const x: number = 'a';\n");
    const r = npmRun(dir, 'typecheck');
    expect(r.status).not.toBe(0);
  }, 120_000);

  it('typecheck FALLA ante una variable sin usar en un .astro (strictest)', () => {
    const dir = sandbox();
    writeIn(dir, 'src/pages/u.astro', '---\nconst unused = 1;\n---\n<p>x</p>\n');
    const r = npmRun(dir, 'typecheck');
    expect(r.status).not.toBe(0);
  }, 120_000);

  it('typecheck FALLA ante un atributo inválido en una plantilla .astro', () => {
    const dir = sandbox();
    writeIn(dir, 'src/pages/w.astro', '---\n---\n<div client:load></div>\n');
    const r = npmRun(dir, 'typecheck');
    expect(r.status).not.toBe(0);
  }, 120_000);

  it('build sin PUBLIC_GA_ID genera dist/index.html conforme (lang, h1 único, canonical, nada en línea)', () => {
    const dir = sandbox();
    const r = npmRun(dir, 'build', ['PUBLIC_GA_ID']);
    expect(r.status, r.output).toBe(0);
    const html = readIn(dir, 'dist/index.html');
    expect(html, 'dist/index.html existe').not.toBeNull();
    if (html === null) return;
    expect(html).toMatch(/<html lang="es">/);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://nandogomez.com/">');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+">/);
    expect(html).not.toMatch(/<style|style=|<script(?![^>]*\ssrc=)|\son\w+=/i);
    expect(html).not.toMatch(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/);
  }, 120_000);
});

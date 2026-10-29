import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, it } from 'vitest';
import { pages } from './helpers';

// P7a (docs/PLAN.md §4.4, §10.2, A2): marcado del banner y del panel, sin comportamiento.
const all = pages();
const ACTIONS = ['accept', 'reject', 'save', 'toggle', 'open', 'close'];

describe.each(all.map((p) => ({ ...p, name: p.file.split('/').pop()! })))('consent · $name', ({ doc }) => {
  const banner = doc.querySelector<HTMLElement>('#ng-consent-banner');
  const dialog = doc.querySelector('dialog');

  it('#ng-consent único, con el banner oculto por defecto y fuera del dialog', () => {
    expect(doc.querySelectorAll('#ng-consent')).toHaveLength(1);
    expect(banner?.hasAttribute('hidden')).toBe(true);
    expect(banner?.closest('dialog')).toBeNull();
    expect(banner?.closest('#ng-consent')).not.toBeNull();
  });

  it('Rechazar y Aceptar tienen idéntica className y son type=button', () => {
    const rej = banner?.querySelector<HTMLElement>('[data-consent-action=reject]');
    const acc = banner?.querySelector<HTMLElement>('[data-consent-action=accept]');
    expect(rej?.textContent?.trim()).toBe('Rechazar');
    expect(acc?.textContent?.trim()).toBe('Aceptar');
    expect(rej?.className).toBeTruthy();
    expect(rej?.className).toBe(acc?.className);
    expect(rej?.getAttribute('type')).toBe('button');
    expect(acc?.getAttribute('type')).toBe('button');
    expect(banner?.querySelector('[data-consent-action=open]')?.textContent?.trim()).toBe('Configurar');
  });

  it('dialog con aria-labelledby válido y sin atributo open', () => {
    expect(doc.querySelectorAll('dialog')).toHaveLength(1);
    const id = dialog?.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(dialog?.querySelector(`#${id}`)?.textContent?.trim()).toBe('Preferencias de cookies');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('switch de analítica: button role=switch aria-checked=false con nombre', () => {
    const sw = dialog?.querySelector('button[role=switch]');
    expect(sw?.getAttribute('aria-checked')).toBe('false');
    expect(sw?.getAttribute('aria-label')).toBe('Cookies de analítica');
    expect(sw?.getAttribute('data-consent-action')).toBe('toggle');
    expect(dialog?.querySelectorAll('[role=switch]')).toHaveLength(1);
  });

  it('fila de técnicas «Siempre activas» sin control', () => {
    const row = [...(dialog?.querySelectorAll('[data-consent-row]') ?? [])].find((r) => /Técnicas/.test(r.textContent ?? ''));
    expect(row?.textContent).toMatch(/Siempre activas/);
    expect(row?.querySelector('button, input, [role=switch]')).toBeNull();
  });

  it('botones del panel: Rechazar todo, Aceptar todo y Guardar selección; cerrar', () => {
    const by = (a: string) => dialog?.querySelector<HTMLElement>(`[data-consent-action=${a}]`);
    expect(by('reject')?.textContent?.trim()).toBe('Rechazar todo');
    expect(by('accept')?.textContent?.trim()).toBe('Aceptar todo');
    expect(by('save')?.textContent?.trim()).toBe('Guardar selección');
    expect(by('close')).not.toBeNull();
    expect(by('reject')?.className).toBe(by('accept')?.className);
    expect(by('save')?.className).not.toBe(by('accept')?.className);
  });

  it('todos los botones son type=button y su data-consent-action es válida', () => {
    const buttons = [...doc.querySelectorAll('#ng-consent button')];
    expect(buttons.length).toBeGreaterThanOrEqual(8);
    for (const b of buttons) {
      expect(b.getAttribute('type')).toBe('button');
      expect(ACTIONS).toContain(b.getAttribute('data-consent-action'));
    }
  });

  it('región role=status aria-live=polite vacía', () => {
    const st = doc.querySelector('#ng-consent [role=status]');
    expect(st?.getAttribute('aria-live')).toBe('polite');
    expect(st?.textContent?.trim()).toBe('');
  });

  it('solo un botón lima visible a la vez: el banner no contiene «Guardar»', () => {
    expect(banner?.querySelector('[data-consent-action=save]')).toBeNull();
  });
});

describe('A2 · data-ga-id con PUBLIC_GA_ID válido (build temporal)', () => {
  const out = mkdtempSync(join(tmpdir(), 'ng-p7a-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it.each([
    ['', null],
    ['G-TEST1234', 'G-TEST1234'],
    ['  G-TEST1234 ', 'G-TEST1234'],
    ['no-valido', null],
  ])('PUBLIC_GA_ID=%j → data-ga-id=%j en todas las páginas', (id, expected) => {
    const dir = join(out, String(id).trim().replace(/\W/g, '_') || 'vacio');
    execFileSync('npx', ['astro', 'build', '--outDir', dir], {
      cwd: join(import.meta.dirname, '../..'),
      env: { ...process.env, PUBLIC_GA_ID: id },
      stdio: 'pipe',
    });
    const files = readdirSync(dir).filter((f) => f.endsWith('.html'));
    expect(files).toHaveLength(5);
    for (const f of files) {
      const el = new JSDOM(readFileSync(join(dir, f), 'utf8')).window.document.querySelector('#ng-consent');
      expect(el?.getAttribute('data-ga-id'), f).toBe(expected);
      if (expected === null) expect(el?.hasAttribute('data-ga-id'), f).toBe(false);
    }
  });
});

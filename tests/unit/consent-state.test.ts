import { describe, expect, it } from 'vitest';
import { reduce, type Action, type UiState } from '../../src/lib/consent/state';
import type { Consent } from '../../src/lib/consent/core';

const yes: Consent = { version: 1, analytics: true, savedAt: 1_767_225_600 };
const no: Consent = { version: 1, analytics: false, savedAt: 1_767_225_600 };
const st = (view: UiState['view'], draft: boolean, saved: Consent | null): UiState => ({ view, draft, saved });
const start = st('hidden', false, null);

describe('init', () => {
  it('sin decisión: banner y analítica desactivada', () => {
    expect(reduce(start, { type: 'init', saved: null })).toEqual(st('banner', false, null));
  });
  it('con decisión: oculto y borrador precargado', () => {
    expect(reduce(start, { type: 'init', saved: yes })).toEqual(st('hidden', true, yes));
    expect(reduce(start, { type: 'init', saved: no })).toEqual(st('hidden', false, no));
  });
  it('reinicia cualquier estado previo', () => {
    expect(reduce(st('panel', true, yes), { type: 'init', saved: null })).toEqual(st('banner', false, null));
  });
});

describe('accept / reject', () => {
  it('desde el banner guardan y ocultan', () => {
    const a = reduce(st('banner', false, null), { type: 'accept' });
    expect(a).toMatchObject({ view: 'hidden', draft: true });
    expect(a.saved).toMatchObject({ version: 1, analytics: true });
    const r = reduce(st('banner', false, null), { type: 'reject' });
    expect(r).toMatchObject({ view: 'hidden', draft: false });
    expect(r.saved).toMatchObject({ version: 1, analytics: false });
  });
  it('conservan savedAt previo si existe y usan 0 si no (lo fija la capa DOM al escribir)', () => {
    expect(reduce(st('banner', false, no), { type: 'accept' }).saved?.savedAt).toBe(no.savedAt);
    expect(reduce(st('banner', false, null), { type: 'accept' }).saved?.savedAt).toBe(0);
  });
  it('desde el panel también guardan', () => {
    expect(reduce(st('panel', false, yes), { type: 'reject' })).toMatchObject({ view: 'hidden', draft: false });
    expect(reduce(st('panel', false, no), { type: 'accept' })).toMatchObject({ view: 'hidden', draft: true });
  });
  it('con la UI oculta no hacen nada', () => {
    const s = st('hidden', false, no);
    expect(reduce(s, { type: 'accept' })).toBe(s);
    expect(reduce(s, { type: 'reject' })).toBe(s);
  });
});

describe('open', () => {
  it('abre el panel precargando la elección actual', () => {
    expect(reduce(st('hidden', false, yes), { type: 'open' })).toEqual(st('panel', true, yes));
    expect(reduce(st('hidden', true, no), { type: 'open' })).toEqual(st('panel', false, no));
  });
  it('sin decisión previa, precarga desactivado', () => {
    expect(reduce(st('banner', true, null), { type: 'open' })).toEqual(st('panel', false, null));
  });
  it('estando en el panel, recarga el borrador desde lo guardado', () => {
    expect(reduce(st('panel', false, yes), { type: 'open' })).toEqual(st('panel', true, yes));
  });
});

describe('toggle', () => {
  it('invierte el borrador en el panel sin tocar lo guardado', () => {
    expect(reduce(st('panel', false, no), { type: 'toggle' })).toEqual(st('panel', true, no));
    expect(reduce(st('panel', true, null), { type: 'toggle' })).toEqual(st('panel', false, null));
  });
  it('fuera del panel no hace nada', () => {
    for (const v of ['hidden', 'banner'] as const) {
      const s = st(v, false, null);
      expect(reduce(s, { type: 'toggle' })).toBe(s);
    }
  });
});

describe('save', () => {
  it('guarda el borrador y oculta', () => {
    const a = reduce(st('panel', true, null), { type: 'save' });
    expect(a).toMatchObject({ view: 'hidden', draft: true });
    expect(a.saved).toMatchObject({ version: 1, analytics: true, savedAt: 0 });
    const b = reduce(st('panel', false, yes), { type: 'save' });
    expect(b).toMatchObject({ view: 'hidden', draft: false });
    expect(b.saved).toEqual({ ...yes, analytics: false });
  });
  it('fuera del panel no hace nada', () => {
    for (const v of ['hidden', 'banner'] as const) {
      const s = st(v, true, null);
      expect(reduce(s, { type: 'save' })).toBe(s);
    }
  });
});

describe('escape', () => {
  it('en el panel sin decisión vuelve al banner', () => {
    expect(reduce(st('panel', true, null), { type: 'escape' })).toEqual(st('banner', false, null));
  });
  it('en el panel con decisión oculta y descarta el borrador', () => {
    expect(reduce(st('panel', false, yes), { type: 'escape' })).toEqual(st('hidden', true, yes));
    expect(reduce(st('panel', true, no), { type: 'escape' })).toEqual(st('hidden', false, no));
  });
  it('en el banner o en oculto: sin cambio', () => {
    const b = st('banner', false, null);
    const h = st('hidden', true, yes);
    expect(reduce(b, { type: 'escape' })).toBe(b);
    expect(reduce(h, { type: 'escape' })).toBe(h);
  });
});

describe('robustez', () => {
  it('es puro: no muta el estado de entrada', () => {
    const s = Object.freeze(st('panel', false, yes));
    const actions: Action[] = [
      { type: 'toggle' }, { type: 'save' }, { type: 'escape' }, { type: 'open' }, { type: 'accept' }, { type: 'reject' },
    ];
    for (const a of actions) expect(() => reduce(s, a)).not.toThrow();
  });
  it('acción desconocida: devuelve el mismo estado', () => {
    const s = st('banner', false, null);
    expect(reduce(s, { type: 'nope' } as unknown as Action)).toBe(s);
  });
});

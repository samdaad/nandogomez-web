// Reductor puro de la UI de consentimiento (docs/PLAN.md §4.2).
import { CONSENT_VERSION, type Consent } from './core';

export type View = 'hidden' | 'banner' | 'panel';
export type UiState = { view: View; draft: boolean; saved: Consent | null };
export type Action =
  | { type: 'init'; saved: Consent | null }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'open' }
  | { type: 'toggle' }
  | { type: 'save' }
  | { type: 'escape' };

// El reductor no conoce la hora: `savedAt` se conserva o queda en 0 y la capa DOM lo fija al escribir la cookie.
const decide = (s: UiState, analytics: boolean): UiState => ({
  view: 'hidden',
  draft: analytics,
  saved: { version: CONSENT_VERSION, analytics, savedAt: s.saved?.savedAt ?? 0 },
});

export function reduce(s: UiState, a: Action): UiState {
  switch (a.type) {
    case 'init':
      return { view: a.saved === null ? 'banner' : 'hidden', draft: a.saved?.analytics ?? false, saved: a.saved };
    case 'accept':
      return s.view === 'hidden' ? s : decide(s, true);
    case 'reject':
      return s.view === 'hidden' ? s : decide(s, false);
    case 'open':
      return { ...s, view: 'panel', draft: s.saved?.analytics ?? false };
    case 'toggle':
      return s.view === 'panel' ? { ...s, draft: !s.draft } : s;
    case 'save':
      return s.view === 'panel' ? decide(s, s.draft) : s;
    case 'escape':
      return s.view === 'panel'
        ? { view: s.saved === null ? 'banner' : 'hidden', draft: s.saved?.analytics ?? false, saved: s.saved }
        : s;
    default:
      return s;
  }
}

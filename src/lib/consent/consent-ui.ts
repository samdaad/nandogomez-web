// Capa DOM fina del consentimiento (docs/PLAN.md §3, §4.4, §5): une el marcado de ConsentManager con
// el reductor, la cookie y la analítica. Sin JS el banner sigue `hidden` y los enlaces funcionan.
import { isValidGaId } from '../ga';
import { loadAnalytics, revokeAnalytics } from './analytics';
import { CONSENT_COOKIE, expireCookieWrites, readConsent, useSecureAttribute, writeConsent } from './core';
import { reduce, type Action, type UiState, type View } from './state';

const DECISIONS = new Set(['accept', 'reject', 'save']);

export function initConsentUi(doc: Document, win: Window): void {
  const root = doc.getElementById('ng-consent');
  const banner = root?.querySelector<HTMLElement>('#ng-consent-banner');
  const panel = root?.querySelector<HTMLDialogElement>('#ng-consent-panel');
  const title = root?.querySelector<HTMLElement>('#ng-consent-title');
  const toggle = root?.querySelector<HTMLElement>('[data-consent-action=toggle]');
  const status = root?.querySelector<HTMLElement>('[data-consent-status]');
  if (!root || !banner || !panel || !title || !toggle || !status) return;

  const gaId = isValidGaId(root.dataset.gaId) ? root.dataset.gaId : null;
  const nowS = () => Math.floor(Date.now() / 1000);
  let opener: HTMLElement | null = null;
  let state: UiState = reduce(
    { view: 'hidden', draft: false, saved: null },
    { type: 'init', saved: readConsent(() => doc.cookie, nowS()) },
  );

  const restoreFocus = () => {
    const main = doc.getElementById('main');
    main?.setAttribute('tabindex', '-1');
    const target = opener?.isConnected && !opener.closest('[hidden]') ? opener : main;
    target?.focus();
  };

  const render = (prev: View) => {
    banner.hidden = state.view !== 'banner';
    toggle.setAttribute('aria-checked', String(state.draft));
    if (state.view === 'panel') {
      if (!panel.open) {
        panel.showModal();
        title.focus();
      }
    } else if (panel.open) panel.close();
    if (prev === 'panel' && state.view !== 'panel') restoreFocus();
  };

  // Borra copias con otros Domain/Path (si no, el banner volvería en bucle), escribe y relee.
  const persist = (wanted: boolean): boolean => {
    const { hostname, pathname, protocol } = win.location;
    try {
      for (const path of new Set(['/', pathname]))
        for (const c of expireCookieWrites(CONSENT_COOKIE, hostname)) doc.cookie = c.replace('Path=/', `Path=${path}`);
    } catch {
      /* cookies bloqueadas */
    }
    const t = nowS();
    const wrote = writeConsent((c) => void (doc.cookie = c), wanted, t, { secure: useSecureAttribute(protocol, hostname) });
    return wanted && wrote && readConsent(() => doc.cookie, t)?.analytics === true;
  };

  const decide = (wanted: boolean) => {
    const granted = persist(wanted);
    if (granted && gaId) loadAnalytics(gaId, doc, win);
    else revokeAnalytics(gaId ?? '', doc, win);
    status.textContent = wanted && !granted
      ? 'No se han podido guardar las preferencias: analítica rechazada'
      : `Preferencias guardadas: analítica ${granted ? 'aceptada' : 'rechazada'}`;
    doc.dispatchEvent(new (win as unknown as typeof globalThis).CustomEvent('ng:consent-change', { detail: { analytics: granted } }));
  };

  const act = (a: Action) => {
    const prev = state;
    state = reduce(prev, a);
    if (state === prev) return;
    render(prev.view);
    if (DECISIONS.has(a.type) && prev.view !== 'hidden' && state.view === 'hidden') decide(state.saved?.analytics === true);
  };

  const open = (from: HTMLElement | null) => {
    opener = from;
    act({ type: 'open' });
  };

  doc.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-consent-open], [data-consent-action]');
    if (!el) return;
    if (el.hasAttribute('data-consent-open')) {
      e.preventDefault();
      return open(el);
    }
    if (!root.contains(el)) return;
    const name = el.dataset.consentAction;
    if (name === 'open') open(el);
    else if (name === 'close') act({ type: 'escape' });
    else if (name === 'accept' || name === 'reject' || name === 'save' || name === 'toggle') act({ type: name });
  });
  doc.addEventListener('ng:consent-open', () => open(doc.activeElement as HTMLElement | null));
  panel.addEventListener('close', () => {
    if (state.view === 'panel') act({ type: 'escape' });
  });

  render('hidden');
  if (state.saved?.analytics && gaId) loadAnalytics(gaId, doc, win);
}

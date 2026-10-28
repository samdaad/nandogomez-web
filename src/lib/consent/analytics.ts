// Carga y revocación de GA4 con Consent Mode v2 básico (docs/PLAN.md §4.3). Recibe document y window.
import { isValidGaId } from '../ga';
import { expireCookieWrites, gaCookiesToClear } from './core';

type Win = Window & Record<string, unknown>;
const SRC = 'https://www.googletagmanager.com/gtag/js?id=';

export const gtagCommands = (gaId: string): unknown[][] => [
  ['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' }],
  ['js', new Date()],
  ['config', gaId, { allow_google_signals: false, allow_ad_personalization_signals: false }],
];

function ensureGtag(win: Win): (...args: unknown[]) => void {
  const dl = (win.dataLayer ??= []) as unknown[];
  return (win.gtag ??= function gtag(..._args: unknown[]) {
    dl.push(arguments);
  }) as (...args: unknown[]) => void;
}

export function loadAnalytics(gaId: string, doc: Document, win: Window): void {
  if (!isValidGaId(gaId)) return;
  const w = win as Win;
  const gtag = ensureGtag(w);
  if (doc.querySelector('script[data-ng-ga]')) {
    if (w[`ga-disable-${gaId}`] === true) {
      w[`ga-disable-${gaId}`] = false;
      gtag('consent', 'update', { analytics_storage: 'granted' });
    }
    return;
  }
  for (const cmd of gtagCommands(gaId)) gtag(...cmd);
  const s = doc.createElement('script');
  s.async = true;
  s.dataset.ngGa = '';
  s.src = SRC + gaId;
  doc.head.appendChild(s);
}

export function revokeAnalytics(gaId: string, doc: Document, win: Window): void {
  const w = win as Win;
  const valid = isValidGaId(gaId);
  if (valid) w[`ga-disable-${gaId}`] = true;
  if (typeof w.gtag === 'function') (w.gtag as (...a: unknown[]) => void)('consent', 'update', { analytics_storage: 'denied' });
  const names = new Set(gaCookiesToClear(doc.cookie));
  if (valid) ['_ga', `_ga_${gaId.slice(2)}`].forEach((n) => names.add(n));
  for (const n of names) for (const c of expireCookieWrites(n, win.location.hostname)) doc.cookie = c;
}

import { readFileSync } from 'node:fs';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export { expect };

export const PAGES = ['/', '/aviso-legal', '/privacidad', '/cookies', '/404'] as const;
export const GA_ID = 'G-TEST1234';
export const GTAG_URL = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

const GOOGLE_HOST = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;
export const isGoogle = (href: string): boolean => {
  try {
    return GOOGLE_HOST.test(new URL(href).hostname);
  } catch {
    return false;
  }
};

/** La CSP real de public/_headers (bloque `/*`): la misma que sirve el servidor de e2e. */
export const EXPECTED_CSP = /Content-Security-Policy:\s*(.+)/.exec(readFileSync('public/_headers', 'utf8'))?.[1]?.trim() ?? '';

type Fixtures = { google: string[]; violations: string[] };

export const test = base.extend<Fixtures>({
  // Toda petición a Google se anota y se responde 204: nunca sale a la red real.
  google: [
    async ({ context }, use) => {
      const urls: string[] = [];
      context.on('request', (r) => {
        if (isGoogle(r.url())) urls.push(r.url());
      });
      await context.route((u) => isGoogle(u.href), (route) => route.fulfill({ status: 204 }));
      await use(urls);
    },
    { auto: true },
  ],
  // Violaciones de CSP: evento `securitypolicyviolation` (reenviado a consola) y errores de consola de CSP.
  violations: [
    async ({ context, page }, use) => {
      const found: string[] = [];
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) =>
          console.error(`CSPV ${e.violatedDirective} ${e.blockedURI}`),
        );
      });
      page.on('console', (m) => {
        if (m.type() === 'error' && /Content Security Policy|CSPV/.test(m.text())) found.push(m.text());
      });
      page.on('pageerror', (e) => void found.push(`pageerror ${e.message}`));
      await use(found);
    },
    { auto: true },
  ],
});

export const banner = (page: Page) => page.locator('#ng-consent-banner');
export const panel = (page: Page) => page.locator('#ng-consent-panel');
export const footerOpen = (page: Page) => page.locator('footer').getByRole('link', { name: 'Configurar cookies' });
export const gaCookies = async (ctx: BrowserContext) => (await ctx.cookies()).filter((c) => /^_ga/.test(c.name));

/** Abre una página y espera a que el JS del consentimiento haya decidido el banner. */
export async function visit(page: Page, path: string, opts: { expectBanner?: boolean } = {}) {
  const res = await page.goto(path);
  if (opts.expectBanner === true) await expect(banner(page)).toBeVisible();
  if (opts.expectBanner === false) await expect(page.locator('#ng-consent[data-ga-id]')).toBeAttached();
  return res;
}

export const choose = async (page: Page, action: 'accept' | 'reject') =>
  banner(page).locator(`[data-consent-action=${action}]`).click();

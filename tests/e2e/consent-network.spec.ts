import { PAGES, GA_ID, GTAG_URL, banner, choose, expect, gaCookies, panel, test, visit } from './fixtures';

test.describe('A6: red y cookies', () => {
  for (const path of PAGES) {
    test(`primera visita a ${path}: cero peticiones a Google y cero _ga*`, async ({ page, context, google }) => {
      await visit(page, path, { expectBanner: true });
      await page.waitForLoadState('networkidle');
      expect(google).toEqual([]);
      expect(await gaCookies(context)).toEqual([]);
    });
  }

  test('tras Rechazar: nada de Google, ni recargando ni navegando', async ({ page, context, google }) => {
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'reject');
    await expect(banner(page)).toBeHidden();
    await page.reload();
    await visit(page, '/', { expectBanner: false });
    await expect(banner(page)).toBeHidden();
    for (const path of PAGES.slice(1)) {
      await visit(page, path, { expectBanner: false });
      await expect(banner(page)).toBeHidden();
    }
    await page.waitForLoadState('networkidle');
    expect(google).toEqual([]);
    expect(await gaCookies(context)).toEqual([]);
    expect(await page.evaluate((id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`], GA_ID)).toBe(true);
  });

  test('tras Aceptar: exactamente una petición a gtag/js y ninguna antes', async ({ page, google }) => {
    await visit(page, '/', { expectBanner: true });
    await page.waitForLoadState('networkidle');
    expect(google).toEqual([]);
    await choose(page, 'accept');
    await expect.poll(() => google.length).toBe(1);
    await page.waitForLoadState('networkidle');
    expect(google).toEqual([GTAG_URL]);
    await expect(page.locator('[data-consent-status]')).toHaveText('Preferencia guardada: analítica aceptada');
  });

  test('tras recargar con la elección aceptada: sin banner y GA se carga una vez', async ({ page, google }) => {
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'accept');
    await expect.poll(() => google.length).toBe(1);
    await page.reload();
    await visit(page, '/', { expectBanner: false });
    await expect(banner(page)).toBeHidden();
    await expect.poll(() => google.length).toBe(2);
    expect(google).toEqual([GTAG_URL, GTAG_URL]);
  });

  test('revocar desde el panel: ga-disable, _ga* borradas y sin peticiones nuevas', async ({ page, context, google }) => {
    await visit(page, '/privacidad', { expectBanner: true });
    await choose(page, 'accept');
    await expect.poll(() => google.length).toBe(1);
    // GA real (aquí un 204) habría dejado estas cookies; las plantamos para comprobar el borrado.
    await page.evaluate((id) => {
      document.cookie = '_ga=GA1.1.111.222; Path=/';
      document.cookie = `_ga_${id.slice(2)}=GS2.1.s1; Path=/`;
    }, GA_ID);
    expect((await gaCookies(context)).map((c) => c.name).sort()).toEqual(['_ga', `_ga_${GA_ID.slice(2)}`]);

    await page.getByRole('link', { name: 'Configurar cookies' }).click();
    await expect(panel(page)).toBeVisible();
    const toggle = panel(page).getByRole('switch', { name: 'Cookies de analítica' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await panel(page).getByRole('button', { name: 'Guardar selección' }).click();
    await expect(panel(page)).toBeHidden();

    expect(await page.evaluate((id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`], GA_ID)).toBe(true);
    expect(await gaCookies(context)).toEqual([]);
    const before = google.length;
    await page.evaluate(() => (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 'probe'));
    await visit(page, '/cookies', { expectBanner: false });
    await page.waitForLoadState('networkidle');
    expect(google.length).toBe(before);
    expect((await context.cookies()).find((c) => c.name === 'ng_consent')?.value).toMatch(/^v1\.denied\.\d{10}$/);
  });
});

test.describe('persistencia y contrato de la cookie', () => {
  test('la elección se mantiene entre páginas, sin banner en bucle', async ({ page }) => {
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'reject');
    for (const path of [...PAGES.slice(1), '/']) {
      await visit(page, path, { expectBanner: false });
      await expect(banner(page)).toBeHidden();
    }
  });

  test('ng_consent: valor y atributos del contrato (§4.1)', async ({ page, context }) => {
    const t0 = Math.floor(Date.now() / 1000);
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'accept');
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'ng_consent')).toBe(true);
    const c = (await context.cookies()).find((x) => x.name === 'ng_consent')!;
    expect(c.value).toMatch(/^v1\.granted\.\d{10}$/);
    expect(Number(c.value.split('.')[2])).toBeGreaterThanOrEqual(t0 - 2);
    expect(c.path).toBe('/');
    expect(c.sameSite).toBe('Lax');
    expect(c.secure).toBe(false); // http://localhost: Secure se omite solo aquí
    expect(c.httpOnly).toBe(false);
    expect(c.domain).toBe('localhost'); // sin atributo Domain
    expect(c.expires - Date.now() / 1000).toBeGreaterThan(31_536_000 - 120);
    expect(c.expires - Date.now() / 1000).toBeLessThanOrEqual(31_536_000 + 5);
  });
});

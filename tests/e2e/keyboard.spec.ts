import { banner, expect, footerOpen, panel, test, visit } from './fixtures';

test.describe('teclado y foco (A15)', () => {
  test('el skip link es lo primero al tabular y lleva a main', async ({ page }) => {
    await visit(page, '/', { expectBanner: true });
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
  });

  test('«Configurar cookies» abre el panel con foco en el título', async ({ page }) => {
    await visit(page, '/privacidad', { expectBanner: true });
    await footerOpen(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('#ng-consent-title')).toBeFocused();
    await expect(page).toHaveURL(/\/privacidad$/); // no navega
  });

  test('Escape cierra sin guardar y devuelve el foco al disparador', async ({ page, context }) => {
    await visit(page, '/privacidad', { expectBanner: true });
    const opener = footerOpen(page);
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(banner(page)).toBeVisible(); // sin elección guardada vuelve el banner
    expect((await context.cookies()).some((c) => c.name === 'ng_consent')).toBe(false);
  });

  test('Tab y Shift+Tab no escapan del <dialog> modal', async ({ page }) => {
    await visit(page, '/', { expectBanner: true });
    await footerOpen(page).click();
    await expect(panel(page)).toBeVisible();
    // Un modal cede el foco al navegador (document.body) al salir del último control y vuelve a entrar:
    // lo prohibido es llegar a cualquier control de la página de fondo (skip link, banner, nav, pie).
    const where = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a?.closest('#ng-consent-panel') ? 'dialog' : a === document.body || !a ? 'browser' : `FUERA:${a.tagName}.${a.textContent?.slice(0, 20)}`;
      });
    const seen = new Set<string>();
    for (const key of ['Tab', 'Shift+Tab'])
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(key);
        const w = await where();
        expect(['dialog', 'browser'], `${key} #${i + 1}: ${w}`).toContain(w);
        if (w === 'dialog') seen.add(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
      }
    expect([...seen]).toEqual(expect.arrayContaining(['Cerrar', 'Rechazar todo', 'Aceptar todo', 'Guardar selección']));
  });
});

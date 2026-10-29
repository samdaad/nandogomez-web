import { banner, expect, panel, test, visit } from './fixtures';

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
    await page.getByRole('link', { name: 'Configurar cookies' }).click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('#ng-consent-title')).toBeFocused();
    await expect(page).toHaveURL(/\/privacidad$/); // no navega
  });

  test('Escape cierra sin guardar y devuelve el foco al disparador', async ({ page, context }) => {
    await visit(page, '/privacidad', { expectBanner: true });
    const opener = page.getByRole('link', { name: 'Configurar cookies' });
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
    await page.getByRole('link', { name: 'Configurar cookies' }).click();
    await expect(panel(page)).toBeVisible();
    const insideDialog = () => page.evaluate(() => !!document.activeElement?.closest('#ng-consent-panel'));
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await insideDialog(), `Tab #${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideDialog(), `Shift+Tab #${i + 1}`).toBe(true);
    }
  });
});

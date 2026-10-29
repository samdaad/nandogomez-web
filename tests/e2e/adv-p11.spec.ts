// Adversario P11. Cierra los huecos que dejó pasar el mutation testing manual:
// - m1b: gtag cargado SIN consentimiento con un retraso (setTimeout 1,5 s) o al primer scroll/tecla: las
//   specs del coder solo miran ~500 ms (networkidle) y no interactúan, así que daban verde.
// - m4b: sin restoreFocus() el foco vuelve igualmente en Escape (lo restaura el <dialog> nativo), pero si el
//   disparador ya no está visible (botón «Configurar» del banner) debe ir a #main (§5) y nadie lo comprobaba.
// - inercia del fondo con el panel abierto (A15): se comprueba por hit-testing, no solo por Tab.
import type { Page } from '@playwright/test';
import { PAGES, banner, choose, expect, footerOpen, panel, test, visit } from './fixtures';

const gaScripts = (page: Page) =>
  page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /googletagmanager|google-analytics/.test(s)));

/** Lo que un usuario hace sin decidir: mover el ratón, hacer scroll, pulsar una tecla, cambiar de pestaña. */
async function idleUser(page: Page) {
  await page.mouse.move(40, 200);
  await page.mouse.wheel(0, 600);
  await page.keyboard.press('Shift');
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('pagehide'));
  });
}

test.describe('adv P11 · A6 con reloj: nada de Google sin aceptar, por mucho que se espere', () => {
  for (const path of PAGES) {
    test(`${path}: 2 minutos de timers e interacción sin elegir`, async ({ page, google }) => {
      await page.clock.install();
      await visit(page, path, { expectBanner: true });
      await idleUser(page);
      await page.clock.runFor(120_000);
      expect(await gaScripts(page)).toEqual([]);
      expect(await page.locator('script[data-ng-ga]').count()).toBe(0);
      expect(google).toEqual([]);
      await expect(banner(page)).toBeVisible();
    });
  }

  test('tras Rechazar: 2 minutos de timers e interacción, recargando', async ({ page, google }) => {
    await page.clock.install();
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'reject');
    await idleUser(page);
    await page.clock.runFor(120_000);
    expect(await gaScripts(page)).toEqual([]);
    await page.reload();
    await visit(page, '/privacidad', { expectBanner: false });
    await idleUser(page);
    await page.clock.runFor(120_000);
    expect(await gaScripts(page)).toEqual([]);
    expect(google).toEqual([]);
  });

  test('tras Aceptar: un solo <script> de gtag aunque pase el tiempo', async ({ page, google }) => {
    await page.clock.install();
    await visit(page, '/', { expectBanner: true });
    await choose(page, 'accept');
    await idleUser(page);
    await page.clock.runFor(120_000);
    expect(await page.locator('script[data-ng-ga]').count()).toBe(1);
    await expect.poll(() => google.length).toBe(1);
  });
});

test.describe('adv P11 · A15 foco y fondo inerte', () => {
  for (const action of ['Guardar selección', 'Rechazar todo', 'Aceptar todo'] as const) {
    test(`abierto desde «Configurar» del banner y «${action}»: el foco va a #main (el disparador queda oculto)`, async ({ page }) => {
      await visit(page, '/', { expectBanner: true });
      await banner(page).getByRole('button', { name: 'Configurar' }).click();
      await expect(panel(page)).toBeVisible();
      await panel(page).getByRole('button', { name: action }).click();
      await expect(panel(page)).toBeHidden();
      await expect(banner(page)).toBeHidden();
      await expect(page.locator('#main')).toBeFocused();
    });
  }

  test('«Cerrar» devuelve el foco al enlace del pie que abrió el panel', async ({ page }) => {
    await visit(page, '/cookies', { expectBanner: true });
    const opener = footerOpen(page);
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Cerrar' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('con el panel abierto el fondo no recibe clics (modal real, no show())', async ({ page }) => {
    await visit(page, '/', { expectBanner: true });
    const reject = banner(page).getByRole('button', { name: 'Rechazar' });
    const box = (await reject.boundingBox())!;
    await footerOpen(page).click();
    await expect(panel(page)).toBeVisible();
    // Lo que hay bajo el botón «Rechazar» del banner (fuera del diálogo) tiene que ser el propio <dialog> (su ::backdrop).
    const hit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x!, y!);
        return el?.closest('#ng-consent-panel') ? 'dialog' : `${el?.tagName}.${el?.textContent?.trim().slice(0, 20)}`;
      },
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(hit).toBe('dialog');
    expect(await page.evaluate(() => document.querySelector('#ng-consent-panel')?.matches(':modal'))).toBe(true);
  });
});

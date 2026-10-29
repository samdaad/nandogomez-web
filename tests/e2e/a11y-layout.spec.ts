import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { PAGES, banner, choose, expect, footerOpen, panel, test, visit } from './fixtures';

// A13 (docs/PLAN.md §2): 0 violaciones `serious`/`critical` con wcag2a/aa. Añadimos las etiquetas WCAG 2.1
// (a/aa) por ser más estrictas. `moderate`/`minor` no bloquean (el plan solo exige serious/critical): se
// adjuntan al informe para revisarlas.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page, info: TestInfo) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const rest = violations.filter((v) => !blocking.includes(v));
  if (rest.length) await info.attach('axe-no-bloqueantes', { body: JSON.stringify(rest, null, 2), contentType: 'application/json' });
  expect(blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('A13: axe', () => {
  for (const path of PAGES) {
    test(`${path} con el banner visible`, async ({ page }, info) => {
      await visit(page, path, { expectBanner: true });
      await audit(page, info);
    });
    test(`${path} con el panel abierto`, async ({ page }, info) => {
      await visit(page, path, { expectBanner: true });
      await footerOpen(page).click();
      await expect(panel(page)).toBeVisible();
      await audit(page, info);
    });
  }
});

const noHScroll = (page: Page) =>
  page.evaluate(() => ({
    html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));

test.describe('A14: 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const path of PAGES) {
    test(`${path}: sin scroll horizontal, con y sin banner`, async ({ page }) => {
      await visit(page, path, { expectBanner: true });
      expect((await noHScroll(page)).html).toBeLessThanOrEqual(0);
      expect((await noHScroll(page)).body).toBeLessThanOrEqual(0);
      await banner(page).getByRole('button', { name: 'Configurar' }).click(); // a 320 px el banner tapa el pie
      await expect(panel(page)).toBeVisible();
      expect((await noHScroll(page)).html).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      await choose(page, 'reject');
      await expect(banner(page)).toBeHidden();
      expect((await noHScroll(page)).html).toBeLessThanOrEqual(0);
      expect((await noHScroll(page)).body).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('posición del banner (decisión de Nando)', () => {
  for (const [width, side] of [[320, 'full'], [599, 'full'], [600, 'right'], [1280, 'right']] as const) {
    test(`${width}px: ${side}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await visit(page, '/', { expectBanner: true });
      const box = (await banner(page).boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(560.5);
      if (side === 'full') expect(Math.abs(box.x - 16)).toBeLessThanOrEqual(1); // pegado al margen izquierdo
      else {
        expect(Math.abs(box.x + box.width - (width - 16))).toBeLessThanOrEqual(1); // pegado al derecho
        if (width >= 1000) expect(box.x).toBeGreaterThan(width / 2);
      }
    });
  }
});

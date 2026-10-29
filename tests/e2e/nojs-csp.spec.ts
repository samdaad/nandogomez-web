import { EXPECTED_CSP, PAGES, banner, choose, expect, test, visit } from './fixtures';

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of PAGES) {
    test(`${path}: sin banner y con el contenido visible`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(banner(page)).toBeHidden();
      await expect(page.getByRole('link', { name: 'Configurar cookies' }).last()).toBeVisible();
    });
  }

  test('/cookies#configurar es accesible y explica la situación', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Configurar cookies' }).click();
    await expect(page).toHaveURL(/\/cookies#configurar$/);
    await expect(page.locator('#configurar')).toBeVisible();
    await expect(page.getByText('Tienes JavaScript desactivado')).toBeVisible();
    await expect(banner(page)).toBeHidden();
  });
});

test.describe('CSP real de public/_headers', () => {
  test('el servidor de e2e envía la CSP del repositorio', async ({ request }) => {
    expect(EXPECTED_CSP).toContain("default-src 'self'");
    for (const path of PAGES) {
      const res = await request.get(path);
      expect(res.headers()['content-security-policy'], path).toBe(EXPECTED_CSP);
      expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
    }
  });

  for (const path of PAGES) {
    test(`${path}: sin violaciones de CSP antes y después de aceptar`, async ({ page, violations, google }) => {
      await visit(page, path, { expectBanner: true });
      await page.waitForLoadState('networkidle');
      expect(violations).toEqual([]);
      await choose(page, 'accept');
      await expect.poll(() => google.length).toBe(1);
      await page.waitForLoadState('networkidle');
      await page.reload();
      await visit(page, path, { expectBanner: false });
      await page.waitForLoadState('networkidle');
      expect(violations).toEqual([]);
    });
  }
});

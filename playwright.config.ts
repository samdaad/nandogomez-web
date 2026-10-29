import { defineConfig } from '@playwright/test';

// Solo se ejecuta en CI y en local bajo demanda (docs/PLAN.md §6). Hace su propio build con un ID de prueba,
// independiente de vars.PUBLIC_GA_ID, y lo sirve con las cabeceras reales de public/_headers (CSP incluida).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure' },
  // PW_CHROMIUM_PATH: solo para entornos sin `playwright install` (usar un Chromium ya instalado). En CI no se define.
  projects: [{ name: 'chromium', use: { browserName: 'chromium', ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}) } }],
  webServer: {
    command: 'PUBLIC_GA_ID=G-TEST1234 npx astro build --outDir dist-e2e && node tests/e2e/server.mjs',
    url: 'http://localhost:4321/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

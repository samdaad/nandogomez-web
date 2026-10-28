import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/dist/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    // Varios ficheros lanzan `astro build` y comparten .astro/.prerender: en serie para evitar la carrera.
    fileParallelism: false,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/consent/**', 'src/lib/ga.ts'],
      reporter: ['text'],
      thresholds: { lines: 95, perFile: true },
    },
  },
});

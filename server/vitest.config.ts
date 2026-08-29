import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30_000, // LaTeX compilation in validation tests genuinely takes a few seconds
    include: ['tests/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.stress.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000, // 2 minute timeout for stress tests
  },
});

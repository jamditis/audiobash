import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.stress.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000, // 2 minute timeout for stress tests
    setupFiles: ['./tests/setup.ts'],
    // Run test files sequentially to avoid port conflicts in WebSocket tests
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        'vite.config.ts',
        'vitest.config.ts',
        'tailwind.config.js',
        'postcss.config.js',
      ],
      thresholds: {
        // Set initial thresholds - increase as coverage improves
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
    // Use different environments for different test types
    environmentMatchGlobs: [
      // Component tests use jsdom
      ['tests/components/**', 'jsdom'],
      ['tests/unit/**', 'jsdom'],
      // Stress tests, integration tests, and E2E tests use node
      ['tests/stress/**', 'node'],
      ['tests/integration/**', 'node'],
      ['tests/e2e/**', 'node'],
    ],
  },
});

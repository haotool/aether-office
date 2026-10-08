import { defineConfig } from 'vitest/config';
export default defineConfig({
  // Process-spawning suites (PTY, Git, MCP) are timing-sensitive; bound parallelism so they stay deterministic.
  test: {
    include: ['tests/aether/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 20000,
    maxWorkers: 4,
    setupFiles: ['tests/aether/setup-aether-home.ts', 'tests/aether/setup-locales.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary'],
      include: ['apps/**/*.ts', 'packages/**/*.ts'],
      exclude: ['**/*.d.ts', '**/dist/**', 'tests/**', 'e2e/**', 'scripts/**'],
    },
  },
});

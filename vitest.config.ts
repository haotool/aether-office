import { defineConfig } from 'vitest/config';
export default defineConfig({
  // Process-spawning suites (PTY, Git, MCP) are timing-sensitive; bound parallelism so they stay deterministic.
  test: {
    include: ['tests/aether/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 20000,
    maxWorkers: 4,
    setupFiles: ['tests/aether/setup-aether-home.ts'],
  },
});

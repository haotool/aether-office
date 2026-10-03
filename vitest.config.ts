import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/aether/**/*.test.ts'], testTimeout: 10000, hookTimeout: 20000 },
});

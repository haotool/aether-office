import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.js';

export default defineConfig({
  ...base,
  testDir: '.',
  projects: [{ name: 'chrome', use: { channel: process.env['CI'] ? 'chromium' : 'chrome' } }],
  reporter: [['list']],
  timeout: Number(process.env['UX_TIMEOUT_MIN'] ?? 20) * 60_000,
  outputDir: `${process.cwd()}/test-results`,
  use: { ...base.use, actionTimeout: 15_000 },
  webServer: [base.webServer ?? []].flat().map((server) => ({ ...server, cwd: process.cwd() })),
});

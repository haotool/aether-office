import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.js';

const servers = [base.webServer ?? []].flat();

export default defineConfig({
  ...base,
  testDir: '.',
  projects: [{ name: 'chrome' }],
  reporter: [['list']],
  timeout: Number(process.env['UX_TIMEOUT_MIN'] ?? 20) * 60_000,
  outputDir: `${process.cwd()}/test-results`,
  use: { ...base.use, actionTimeout: 15_000 },
  webServer: servers.map((server) => ({ ...server, cwd: process.cwd() })),
});

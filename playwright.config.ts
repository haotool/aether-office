import { defineConfig } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Fixture home so e2e never reads the developer's real ~/.claude or ~/.codex.
const fixtureHome =
  process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? mkdtempSync(join(tmpdir(), 'aether-e2e-home-'));
process.env['AETHER_LOCAL_SESSIONS_HOME'] = fixtureHome;
mkdirSync(join(fixtureHome, '.claude/projects/p'), { recursive: true });
mkdirSync(join(fixtureHome, 'fixture-repo'), { recursive: true });
writeFileSync(
  join(fixtureHome, '.claude/projects/p/e2e-session.jsonl'),
  JSON.stringify({ type: 'user', cwd: join(fixtureHome, 'fixture-repo') }) + '\n',
);
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'evidence/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4320',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx scripts/e2e-server.ts',
      url: 'http://127.0.0.1:4320/health',
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      command: 'node --import tsx scripts/e2e-native-server.ts',
      url: 'http://127.0.0.1:4330/health',
      reuseExistingServer: false,
      timeout: 20000,
    },
  ],
});

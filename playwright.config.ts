import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Fixture home so e2e never reads the developer's real ~/.claude or ~/.codex.
const fixtureHome =
  process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? mkdtempSync(join(tmpdir(), 'aether-e2e-home-'));
process.env['AETHER_LOCAL_SESSIONS_HOME'] = fixtureHome;
process.env['AETHER_HOOK_SPOOL'] = join(fixtureHome, 'hook-events.jsonl');
mkdirSync(join(fixtureHome, '.claude/projects/p'), { recursive: true });
mkdirSync(join(fixtureHome, 'fixture-repo'), { recursive: true });
execFileSync('git', ['init', '-q', join(fixtureHome, 'fixture-repo')]); // sessions join projects by repository
writeFileSync(
  join(fixtureHome, '.claude/projects/p/e2e-session.jsonl'),
  JSON.stringify({ type: 'user', cwd: join(fixtureHome, 'fixture-repo') }) + '\n',
);
writeFileSync(
  process.env['AETHER_HOOK_SPOOL'],
  JSON.stringify({
    at: Date.now() + 3_600_000, // far future so the fixture subagent stays live for the whole run
    provider: 'claude',
    event: 'SubagentStart',
    sessionId: 'e2e-session',
    cwd: join(fixtureHome, 'fixture-repo'),
    agentId: 'sub-1',
    agentType: 'Explore',
  }) + '\n',
);
// The suite exercises every page, so it starts with the orchestration pages shown (Settings → Advanced). A spec that
// checks the CLI-first navigation overrides this with `test.use({ storageState: ... })`.
const advancedOn = {
  name: 'aether-ui-preferences',
  value: JSON.stringify({ state: { advanced: true }, version: 0 }),
};
const storageState = {
  cookies: [],
  origins: ['http://127.0.0.1:4320', 'http://127.0.0.1:4330'].map((origin) => ({
    origin,
    localStorage: [advancedOn],
  })),
};
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
    storageState,
  },
  projects: [
    { name: 'chrome', testIgnore: /ios-only/ },
    // WebKit is the engine of every browser on iOS. Opt in once `playwright install webkit` has been run.
    ...(process.env['AETHER_WEBKIT']
      ? [
          {
            name: 'webkit-iphone',
            testMatch: /(touch-flow|responsive)\.spec\.ts/,
            use: { ...devices['iPhone 15'], browserName: 'webkit' as const, channel: undefined },
          },
        ]
      : []),
  ],
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

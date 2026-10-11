import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The two e2e servers listen on the maintainer's ports unless a second checkout or run sets its own pair (scripts/e2e-*.ts read the same variables).
const port = process.env['AETHER_E2E_PORT'] ?? '4320';
const nativePort = process.env['AETHER_E2E_NATIVE_PORT'] ?? '4330';
// Fixture home so e2e never reads the developer's real ~/.claude or ~/.codex.
const fixtureHome =
  process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? mkdtempSync(join(tmpdir(), 'aether-e2e-home-'));
process.env['AETHER_LOCAL_SESSIONS_HOME'] = fixtureHome;
process.env['AETHER_HOOK_SPOOL'] = join(fixtureHome, 'hook-events.jsonl');
// ...and never the developer's real Claude usage cache either (the KPI limits and the top bar read it).
process.env['AETHER_CLAUDE_USAGE_FILE'] ??= join(fixtureHome, 'claude-hud-usage.json');
mkdirSync(join(fixtureHome, '.claude/projects/p'), { recursive: true });
mkdirSync(join(fixtureHome, 'fixture-repo'), { recursive: true });
execFileSync('git', ['init', '-q', join(fixtureHome, 'fixture-repo')]);
writeFileSync(
  join(fixtureHome, '.claude/projects/p/e2e-session.jsonl'),
  JSON.stringify({ type: 'user', cwd: join(fixtureHome, 'fixture-repo') }) + '\n',
);
// Synthetic hook records (never a real session): one subagent that started and has run two tools, so it stays `running`.
const farFuture = Date.now() + 3_600_000;
const fixtureRecord = (event: string, extra: object = {}) =>
  JSON.stringify({
    at: farFuture,
    provider: 'claude',
    event,
    sessionId: 'e2e-session',
    cwd: join(fixtureHome, 'fixture-repo'),
    agentId: 'sub-1',
    agentType: 'Explore',
    ...extra,
  });
writeFileSync(
  process.env['AETHER_HOOK_SPOOL'],
  [
    fixtureRecord('SubagentStart'),
    fixtureRecord('PreToolUse', { tool: 'Read' }),
    fixtureRecord('PreToolUse', { tool: 'Grep' }),
  ].join('\n') + '\n',
);
const advancedOn = {
  name: 'aether-ui-preferences',
  value: JSON.stringify({ state: { advanced: true }, version: 0 }),
};
const storageState = {
  cookies: [],
  origins: [`http://127.0.0.1:${port}`, `http://127.0.0.1:${nativePort}`].map((origin) => ({
    origin,
    localStorage: [advancedOn],
  })),
};
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: Number(process.env['AETHER_E2E_RETRIES'] ?? (process.env['CI'] ? 2 : 0)),
  reporter: [['list'], ['json', { outputFile: 'evidence/e2e-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // CI installs Playwright's own Chromium; a developer machine uses the installed Chrome.
    channel: process.env['CI'] ? undefined : 'chrome',
    headless: true,
    locale: 'zh-TW',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'only-on-failure',
    storageState,
    serviceWorkers: 'block',
  },
  projects: [
    // e2e/ux-matrix is the audit matrix, about 15 minutes of its own (`pnpm run ux:matrix`).
    { name: 'chrome', testIgnore: /ios-only|ux-matrix/ },
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
      url: `http://127.0.0.1:${port}/health`,
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      command: 'node --import tsx scripts/e2e-native-server.ts',
      url: `http://127.0.0.1:${nativePort}/health`,
      reuseExistingServer: false,
      timeout: 20000,
    },
  ],
});

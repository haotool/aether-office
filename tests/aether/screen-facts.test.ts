import { expect, it } from 'vitest';
import { screensOf } from '../../apps/web/src/features/office-model.js';
import type { AttributedSession } from '../../packages/contracts/src/index.js';

const NOW = 1_800_000_000_000;
const session = (over: Partial<AttributedSession>) =>
  ({
    key: 'claude:a',
    provider: 'claude',
    repo: 'aether-office',
    title: 'Fix the login',
    mtime: NOW - 5_000,
    git: { branch: 'main', upstream: null, ahead: 2, behind: 0, uncommitted: 3 },
    hook: {
      activity: 'working',
      lastEvent: 'PreToolUse',
      tool: 'Bash',
      at: NOW - 1000,
      recent: [
        { tool: 'Edit', target: 'app.ts', at: NOW - 9000 },
        { tool: 'Bash', target: 'pnpm test', at: NOW - 1000 },
      ],
    },
    usage: {
      model: 'claude-opus-5-5',
      contextTokens: 50_000,
      contextWindow: 200_000,
      freshTokens: 1,
    },
    process: 'running',
    liveness: { state: 'active', startedAt: 1, quietMs: 125_000, zombies: [] },
    ports: [5173],
    ...over,
  }) as unknown as AttributedSession;

it("a member's screen carries only what the session says about itself", () => {
  expect(screensOf([session({})], NOW)['local:claude:a']).toEqual({
    provider: 'claude',
    title: 'Fix the login',
    repo: 'aether-office',
    branch: 'main',
    ahead: 2,
    behind: 0,
    uncommitted: 3,
    model: 'claude-opus-5-5',
    contextPercent: 25,
    state: 'working',
    tool: 'Bash',
    toolSince: NOW - 1000,
    recent: [
      { tool: 'Edit', target: 'app.ts' },
      { tool: 'Bash', target: 'pnpm test' },
    ],
    quietMinutes: 2,
    ports: [5173],
  });
});

it('leaves out what is not known instead of filling it in', () => {
  const facts = screensOf(
    [
      session({
        git: null,
        hook: null,
        title: null,
        usage: {
          model: null,
          contextTokens: null,
          contextWindow: null,
          freshTokens: null,
          limit: null,
        },
        liveness: { state: 'unknown', startedAt: null, quietMs: null, zombies: [] },
      }),
    ],
    NOW,
  )['local:claude:a']!;
  expect(facts).toMatchObject({
    branch: null,
    tool: null,
    toolSince: null,
    recent: [],
    title: null,
    model: null,
    contextPercent: null,
    quietMinutes: null,
  });
});

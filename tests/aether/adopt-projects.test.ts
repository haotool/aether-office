import { expect, it } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import {
  dueRepos,
  noteAdoption,
  unclaimedRepos,
  type AdoptTracker,
} from '../../apps/web/src/features/integrations/adoptProjects.js';

const session = (main: string | null, projectId: string | null): AttributedSession =>
  ({
    key: main ?? 'none',
    provider: 'claude',
    sessionId: 's',
    cwd: main ?? '/x',
    repo: 'r',
    mtime: 0,
    git: null,
    worktree: main && { root: main, main, project: main.split('/').pop()!, linked: false },
    hook: null,
    subagents: [],
    process: 'unknown',
    resources: null,
    liveness: { state: 'unknown', startedAt: null, quietMs: null, zombies: [] },
    ports: [],
    title: null,
    classification: { role: 'generalist', department: 'product', confidence: 0, evidence: [] },
    usage: {
      model: null,
      contextTokens: null,
      contextWindow: null,
      contextPct: null,
      compactedAt: null,
      freshTokens: null,
      limit: null,
    },
    projectId,
  }) as AttributedSession;

it('proposes each unowned repository once and skips owned, non-git and scratch directories', () => {
  const found = unclaimedRepos([
    session('/Users/a/Tools/one', null),
    session('/Users/a/Tools/one', null),
    session('/Users/a/Tools/two', 'p-2'),
    session(null, null),
    session('/private/tmp/scratch', null),
  ]);
  expect(found).toEqual([{ root: '/Users/a/Tools/one', name: 'one' }]);
});

it('retries a failed adoption with a growing wait, a bounded number of times, and never one that worked', () => {
  const repos = [{ root: '/a/one', name: 'one' }];
  const tracker: AdoptTracker = new Map();
  expect(dueRepos(repos, tracker, 0)).toEqual(repos);
  noteAdoption(tracker, '/a/one', false, 0);
  expect(dueRepos(repos, tracker, 1999)).toEqual([]);
  expect(dueRepos(repos, tracker, 2000)).toEqual(repos);
  noteAdoption(tracker, '/a/one', false, 2000);
  expect(dueRepos(repos, tracker, 5999)).toEqual([]);
  expect(dueRepos(repos, tracker, 6000)).toEqual(repos);
  noteAdoption(tracker, '/a/one', false, 6000);
  noteAdoption(tracker, '/a/one', false, 20000);
  expect(dueRepos(repos, tracker, 1e9)).toEqual([]);
  noteAdoption(tracker, '/a/two', true, 0);
  expect(dueRepos([{ root: '/a/two', name: 'two' }], tracker, 1e9)).toEqual([]);
});

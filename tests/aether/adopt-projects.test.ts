import { expect, it } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import { unclaimedRepos } from '../../apps/web/src/adoptProjects.js';

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
    title: null,
    classification: { role: 'generalist', department: 'product', basis: 'default', matched: null },
    usage: { model: null, contextTokens: null, contextWindow: null, totalTokens: null },
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

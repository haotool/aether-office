import { describe, expect, it } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import { filterSessions } from '../../apps/web/src/features/sessions/sessions-filter.js';

const none = { query: '', provider: '', department: '', runningOnly: false, liveness: '' };
const make = (key: string, over: Record<string, unknown>) =>
  ({
    key,
    provider: 'claude',
    title: key,
    repo: 'app',
    cwd: '/w',
    mtime: 1,
    process: 'ended',
    git: { branch: 'main' },
    classification: { role: 'engineer', department: 'build' },
    usage: { model: 'opus' },
    liveness: { state: 'idle' },
    ...over,
  }) as unknown as AttributedSession;

describe('filterSessions', () => {
  const all = [
    make('old', { mtime: 1 }),
    make('new', { mtime: 9 }),
    make('live', { mtime: 5, process: 'running' }),
    make('cx', { provider: 'codex', title: 'Fix Login', mtime: 3 }),
  ];
  it('puts running sessions first, then the most recent', () => {
    expect(filterSessions(all, none).map((s) => s.key)).toEqual(['live', 'new', 'cx', 'old']);
  });
  it('filters by provider, running, liveness and a case-insensitive query', () => {
    expect(filterSessions(all, { ...none, provider: 'codex' }).map((s) => s.key)).toEqual(['cx']);
    expect(filterSessions(all, { ...none, runningOnly: true }).map((s) => s.key)).toEqual(['live']);
    expect(filterSessions(all, { ...none, liveness: 'dormant' })).toEqual([]);
    expect(filterSessions(all, { ...none, query: ' LOGIN ' }).map((s) => s.key)).toEqual(['cx']);
  });
});

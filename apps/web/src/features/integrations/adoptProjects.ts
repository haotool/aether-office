import { useEffect, useRef } from 'react';
import type { AttributedSession } from '@aether/contracts';
import { execute } from '../../lib/api/api-commands.js';

const SCRATCH = ['/tmp/', '/private/tmp/']; // agent scratchpads, never real projects

export function unclaimedRepos(
  sessions: readonly AttributedSession[],
): { root: string; name: string }[] {
  const found = new Map<string, string>();
  for (const { worktree, projectId } of sessions)
    if (worktree && !projectId && !SCRATCH.some((p) => worktree.main.startsWith(p)))
      found.set(worktree.main, worktree.project);
  return [...found].map(([root, name]) => ({ root, name }));
}

export type AdoptTracker = Map<string, { tries: number; retryAt: number }>;
export const ADOPT_TRIES = 4;
const ADOPT_BACKOFF_MS = 2000;

export function dueRepos(
  repos: readonly { root: string; name: string }[],
  tracker: AdoptTracker,
  now: number,
): { root: string; name: string }[] {
  return repos.filter((r) => {
    const t = tracker.get(r.root);
    return !t || (t.tries < ADOPT_TRIES && t.retryAt <= now);
  });
}

export function noteAdoption(tracker: AdoptTracker, root: string, ok: boolean, now: number) {
  if (ok) tracker.set(root, { tries: ADOPT_TRIES, retryAt: Infinity });
  else {
    const tries = (tracker.get(root)?.tries ?? 0) + 1;
    tracker.set(root, { tries, retryAt: now + ADOPT_BACKOFF_MS * 2 ** (tries - 1) });
  }
}

export function useAdoptRepos(
  sessions: readonly AttributedSession[] | undefined,
  enabled: boolean,
  onAdopted: () => void,
) {
  const tracker = useRef<AdoptTracker>(new Map());
  useEffect(() => {
    if (!enabled || !sessions) return;
    const fresh = dueRepos(unclaimedRepos(sessions), tracker.current, Date.now());
    if (!fresh.length) return;
    for (const r of fresh)
      tracker.current.set(r.root, {
        tries: tracker.current.get(r.root)?.tries ?? 0,
        retryAt: Infinity,
      });
    void Promise.allSettled(
      fresh.map((r) => execute('project.create', { name: r.name.slice(0, 160), root: r.root })),
    ).then((results) => {
      results.forEach((result, i) => {
        const repo = fresh[i];
        if (repo)
          noteAdoption(tracker.current, repo.root, result.status === 'fulfilled', Date.now());
      });
      onAdopted();
    });
  }, [sessions, enabled, onAdopted]);
}

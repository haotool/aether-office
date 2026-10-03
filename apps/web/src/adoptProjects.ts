import { useEffect, useRef } from 'react';
import type { AttributedSession } from '@aether/contracts';
import { execute } from './api.js';

const SCRATCH = ['/tmp/', '/private/tmp/']; // agent scratchpads, never real projects

/** Main checkouts of sessions that no AETHER project owns yet, once each, ignoring scratch directories. */
export function unclaimedRepos(
  sessions: readonly AttributedSession[],
): { root: string; name: string }[] {
  const found = new Map<string, string>();
  for (const s of sessions)
    if (s.worktree && !s.projectId && !SCRATCH.some((p) => s.worktree!.main.startsWith(p)))
      found.set(s.worktree.main, s.worktree.project);
  return [...found].map(([root, name]) => ({ root, name }));
}

/** Gives every repository a session works in a project, so its sessions appear there. Owner only. */
export function useAdoptRepos(
  sessions: readonly AttributedSession[] | undefined,
  enabled: boolean,
  onAdopted: () => void,
) {
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !sessions) return;
    const fresh = unclaimedRepos(sessions).filter((r) => !attempted.current.has(r.root));
    if (!fresh.length) return;
    for (const r of fresh) attempted.current.add(r.root); // a failure is not retried in a loop
    void Promise.allSettled(
      fresh.map((r) => execute('project.create', { name: r.name.slice(0, 160), root: r.root })),
    ).then(onAdopted);
  }, [sessions, enabled, onAdopted]);
}

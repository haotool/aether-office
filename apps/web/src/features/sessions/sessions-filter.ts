import type { AttributedSession } from '@aether/contracts';

export type SessionFilters = {
  query: string;
  provider: string;
  department: string;
  runningOnly: boolean;
  liveness: string;
};

export function filterSessions(
  sessions: readonly AttributedSession[],
  { query, provider, department, runningOnly, liveness }: SessionFilters,
): AttributedSession[] {
  const q = query.trim().toLowerCase();
  return [...sessions]
    .filter((s) => !provider || s.provider === provider)
    .filter((s) => !department || s.classification.department === department)
    .filter((s) => !runningOnly || s.process === 'running')
    .filter((s) => !liveness || s.liveness.state === liveness)
    .filter(
      (s) =>
        !q ||
        [s.title, s.repo, s.cwd, s.git?.branch, s.classification.role, s.usage.model]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.process === 'running') - Number(a.process === 'running') || b.mtime - a.mtime,
    );
}

export const LIVENESS_LABEL = {
  active: 'livenessActive',
  idle: 'livenessIdle',
  dormant: 'livenessDormant',
  orphaned: 'livenessOrphaned',
  ended: 'livenessEnded',
  unknown: 'livenessUnknown',
} as const;

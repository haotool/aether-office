import type { LocalSessionsResponse } from '@aether/contracts';

type Session = LocalSessionsResponse['sessions'][number];

/**
 * A control plane that has not been restarted since an upgrade answers with the older shape of a session while this build
 * of the page is newer: the fields that were added later are filled in with their "unknown" values, so one stale field
 * cannot take the whole page down.
 */
function normalizeSession(s: Session): Session {
  const classification = s.classification as Partial<Session['classification']>;
  return {
    ...s,
    classification: {
      ...s.classification,
      confidence: classification.confidence ?? 0,
      evidence: classification.evidence ?? [],
    },
    usage: {
      ...s.usage,
      contextPct: s.usage?.contextPct ?? null,
      compactedAt: s.usage?.compactedAt ?? null,
    },
    hook: s.hook ? { ...s.hook, recent: s.hook.recent ?? [] } : s.hook,
  };
}

export const normalizeSessions = (r: LocalSessionsResponse): LocalSessionsResponse => ({
  ...r,
  sessions: (r.sessions ?? []).map(normalizeSession),
});

import { subagentSchema, type LocalSessionsResponse } from '@aether/contracts';
import { cleanTitle } from '@aether/kernel';

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
    // An older control plane sent titles as the provider stored them: clean them the same way (idempotent).
    title: s.title ? cleanTitle(s.title) || null : null,
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
    // Before the lifecycle fields existed a subagent was only an id, a type and a time: the rest is unknown.
    subagents: (s.subagents ?? []).map((c) => subagentSchema.parse(c)),
    // Calls from before labels and outcomes existed carry none (`ok: null` is "not known", never a failure).
    hook: s.hook
      ? {
          ...s.hook,
          recent: (s.hook.recent ?? []).map((c) => ({
            ...c,
            agentId: c.agentId ?? null,
            tags: c.tags ?? [],
            ok: c.ok ?? null,
          })),
        }
      : s.hook,
    git: s.git ? { ...s.git, conflicts: s.git.conflicts ?? 0 } : s.git,
  };
}

export const normalizeSessions = (r: LocalSessionsResponse): LocalSessionsResponse => ({
  ...r,
  sessions: (r.sessions ?? []).map(normalizeSession),
});

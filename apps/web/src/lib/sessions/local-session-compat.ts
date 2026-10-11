import type { LocalSessionsResponse } from '@aether/contracts';
import { cleanTitle } from '@aether/kernel';

type Session = LocalSessionsResponse['sessions'][number];
type Subagent = Session['subagents'][number];

const UNKNOWN_SUBAGENT: Omit<Subagent, 'id' | 'type' | 'lastSeen'> = {
  source: 'hook',
  status: 'unknown',
  startedAt: null,
  endedAt: null,
  nickname: null,
  tools: null,
  label: null,
  tokens: null,
  result: null,
};

/**
 * A control plane not restarted since an upgrade answers with an older session shape: fields added later are filled
 * with their unknown value, so one stale field cannot break the page.
 */
function normalizeSession(s: Session): Session {
  const classification = s.classification as Partial<Session['classification']>;
  return {
    ...s,
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
    subagents: (s.subagents ?? []).map((c): Subagent => ({ ...UNKNOWN_SUBAGENT, ...c })),
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

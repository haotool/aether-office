import { DomainError } from '@aether/kernel';
import type {
  AttributedSession,
  ClockOutItem,
  ClockOutRequest,
  ClockOutSkipReason,
} from '@aether/contracts';
import { stopLocalSession } from './stop-session.js';

/** How many processes are asked to end at once: each may take its whole grace period, and the machine is theirs too. */
const AT_ONCE = 4;
const REFUSALS: Record<string, ClockOutSkipReason> = {
  SESSION_NOT_FOUND: 'not_found',
  SESSION_NOT_RUNNING: 'not_running',
  SESSION_NOT_STALE: 'active',
  PROCESS_CHANGED: 'changed',
  REFUSED_OWN_ANCESTOR: 'own_ancestor',
};

/** What the server knows that the request must not say: which process is behind a session, and whose project it is. */
type Judges = {
  pidOf: (key: string) => number | null;
  mayStop: (projectId: string) => boolean;
};
/** Test seams of the stop: which process is "this server" and how long a process has to end before SIGKILL. */
type Tuning = { controlPid?: number; graceMs?: number };
const skipped = (key: string, reason: ClockOutSkipReason): ClockOutItem => ({
  key,
  outcome: 'skipped',
  reason,
});

async function clockOutOne(
  asked: ClockOutRequest['sessions'][number],
  session: AttributedSession | undefined,
  options: Pick<ClockOutRequest, 'minIdleMs'> & Judges,
  tuning: Tuning,
): Promise<ClockOutItem> {
  const { key, startedAt } = asked;
  if (!session) return skipped(key, 'not_found');
  if (!session.projectId) return skipped(key, 'no_project');
  if (!options.mayStop(session.projectId)) return skipped(key, 'forbidden');
  // The server's own clock decides, not the list the person was looking at: a session that has been used since is left alone.
  const { quietMs } = session.liveness;
  if (quietMs === null || quietMs < options.minIdleMs) return skipped(key, 'active');
  try {
    const { outcome } = await stopLocalSession({
      session,
      pid: options.pidOf(key),
      startedAt,
      force: true,
      ...tuning,
    });
    if (outcome === 'stopped')
      return { key, outcome: 'cleared', freedBytes: session.resources?.rssBytes ?? null };
    return outcome === 'still_running'
      ? { key, outcome: 'failed', reason: 'still_running' }
      : skipped(key, outcome); // 'changed' | 'zombie'
  } catch (error) {
    const reason = error instanceof DomainError ? REFUSALS[error.code] : undefined;
    if (!reason) throw error;
    return skipped(key, reason);
  }
}

/**
 * Sends the named sessions home: each goes through the same checks and the same SIGTERM as stopping one by hand (see
 * stop-session.ts), plus a SIGKILL for one that ignores it, so the memory really is released, and a few at a time.
 * Never throws for one session's refusal: every session gets its own result, in the order asked.
 */
export async function clockOutSessions({
  request,
  sessions,
  pidOf,
  mayStop,
  ...tuning
}: {
  request: ClockOutRequest;
  sessions: readonly AttributedSession[];
} & Judges &
  Tuning): Promise<ClockOutItem[]> {
  const byKey = new Map(sessions.map((s) => [s.key, s]));
  const asked = [...new Map(request.sessions.map((s) => [s.key, s])).values()];
  const results: ClockOutItem[] = new Array(asked.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < asked.length; i = next++) {
      const one = asked[i];
      if (!one) continue;
      results[i] = await clockOutOne(
        one,
        byKey.get(one.key),
        { minIdleMs: request.minIdleMs, pidOf, mayStop },
        tuning,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, asked.length) }, worker));
  return results;
}

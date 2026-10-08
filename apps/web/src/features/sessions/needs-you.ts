import type { LocalSession, Snapshot } from '@aether/contracts';
import { activityOf } from '../../lib/sessions/session-attention.js';

/** A task in one of these states waits for a person: a review, an acceptance, or a failure to look at. */
const WORK_NEEDING_A_PERSON = ['reviewing', 'verified', 'failed', 'indeterminate', 'blocked'];

/** The local sessions stopped on a permission prompt or a question: only a person can move them on. */
export const sessionsWaiting = <S extends LocalSession>(
  sessions: readonly S[] | undefined,
  now: number,
) => (sessions ?? []).filter((s) => activityOf(s, now) === 'waiting_permission');

/** How many sessions need a person: those stopped on a prompt, plus any whose permission request waits here. */
export const sessionsNeedingYou = (
  waiting: readonly { key: string }[],
  asking: ReadonlySet<string>,
) => new Set([...waiting.map((s) => s.key), ...asking]).size;

/**
 * What the badges count (tab bar, sidebar, page title): things that need a person, not how many things exist. A badge
 * that always shows the total teaches people to ignore badges.
 */
export function needsYou(
  data: Snapshot | undefined,
  pendingApprovals: number,
  waitingSessions: number,
) {
  return {
    tasks: data?.work.filter((w) => WORK_NEEDING_A_PERSON.includes(w.state)).length ?? 0,
    messages:
      data?.messages.filter(
        (m) => m.kind === 'request' && m.deliveries.some((d) => d.acknowledgedAt === null),
      ).length ?? 0,
    approvals: pendingApprovals,
    sessions: waitingSessions,
  };
}

/** An observed session blocked on a person: a permission prompt, or a notification that wants an answer. */
export const sessionWaiting = (session: LocalSession, now: number) =>
  activityOf(session, now) === 'waiting_permission';

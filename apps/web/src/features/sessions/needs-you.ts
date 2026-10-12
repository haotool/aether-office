import type { LocalSession, Snapshot } from '@aether/contracts';
import { activityOf } from '../../lib/sessions/session-attention.js';

const WORK_NEEDING_A_PERSON = ['reviewing', 'verified', 'failed', 'indeterminate', 'blocked'];

export const sessionsWaiting = <S extends LocalSession>(
  sessions: readonly S[] | undefined,
  now: number,
) => (sessions ?? []).filter((s) => activityOf(s, now) === 'waiting_permission');

export const sessionsNeedingYou = (
  waiting: readonly { key: string }[],
  asking: ReadonlySet<string>,
) => new Set([...waiting.map((s) => s.key), ...asking]).size;

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

export const sessionWaiting = (session: LocalSession, now: number) =>
  activityOf(session, now) === 'waiting_permission';

import { DomainError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';

export function assertMeetingOpen(
  ctx: Context,
  projectId: string,
  threadId: string,
  rounds: number,
  actor: Actor,
) {
  const meeting = ctx.sqlite
    .prepare(
      'SELECT maxRounds,deadlineAt,concludedAt FROM meetings WHERE threadId=? AND projectId=?',
    )
    .get(threadId, projectId) as
    { maxRounds: number; deadlineAt: number; concludedAt: number | null } | undefined;
  if (!meeting || !actor.agentId) return;
  if (meeting.concludedAt || ctx.now() > meeting.deadlineAt)
    throw new DomainError('MEETING_CLOSED', 409);
  if (rounds >= meeting.maxRounds) throw new DomainError('MEETING_ROUND_LIMIT', 409);
}

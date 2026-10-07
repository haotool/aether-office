import type { Command } from '@aether/contracts';
import type { Actor } from '@aether/kernel';
import { createA2AClient, revokeA2AClient } from './a2a-clients.js';
import { decideApproval } from './approvals.js';
import type { Context } from './context.js';
import {
  approveKnowledge,
  configureExecution,
  createProject,
  proposeKnowledge,
  registerAgent,
  saveLayout,
} from './core-commands.js';
import { createInvitation } from './invitations.js';
import { integrationCommand } from './integrations.js';
import { requestIntegration, requestJob } from './jobs.js';
import { concludeMeeting, startMeeting } from './meetings.js';
import { acknowledge, sendMessage } from './messages.js';
import { addReviewComment } from './review-comments.js';
import { requestReview } from './review-runs.js';
import { reservationCommand } from './reservations.js';
import { roomCommand } from './rooms.js';
import { scheduleCommand } from './schedules.js';
import { skillCommand } from './skills.js';
import { terminalCommand } from './terminals.js';
import { changeWork, createWork } from './work.js';
import { startWorkflow } from './workflows.js';

type Result = Record<string, unknown>;
type Handler<T extends Command['type']> = (
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: T }>,
) => Result;

/** Exactly one handler for every command type: a new type in the contract fails to compile until it has one. */
const HANDLERS: { [T in Command['type']]: Handler<T> } = {
  'terminal.start': terminalCommand,
  'terminal.takeover': terminalCommand,
  'terminal.release': terminalCommand,
  'terminal.input': terminalCommand,
  'terminal.resize': terminalCommand,
  'terminal.stop': terminalCommand,
  'meeting.start': startMeeting,
  'meeting.conclude': concludeMeeting,
  'workflow.start': startWorkflow,
  'room.create': roomCommand,
  'room.members': roomCommand,
  'a2a.client.create': createA2AClient,
  'a2a.client.revoke': (ctx, _actor, c) => revokeA2AClient(ctx, c),
  'machine.invite': createInvitation,
  'integration.connect': integrationCommand,
  'integration.toggle': integrationCommand,
  'skill.import': skillCommand,
  'skill.toggle': skillCommand,
  'schedule.create': scheduleCommand,
  'schedule.toggle': scheduleCommand,
  'work.integrate': requestIntegration,
  'work.comment': addReviewComment,
  'reservation.acquire': reservationCommand,
  'reservation.renew': reservationCommand,
  'reservation.release': reservationCommand,
  'project.create': (ctx, _actor, c) => createProject(ctx, c),
  'project.execution.configure': (ctx, _actor, c) => configureExecution(ctx, c),
  'agent.register': (ctx, _actor, c) => registerAgent(ctx, c),
  'work.verify': requestJob,
  'workspace.diff': requestJob,
  'work.request_review': (ctx, _actor, c) => requestReview(ctx, c),
  'work.create': (ctx, _actor, c) => createWork(ctx, c),
  'work.dependencies': changeWork,
  'work.extend': changeWork,
  'work.retry': changeWork,
  'work.assign': changeWork,
  'work.submit': changeWork,
  'work.review': changeWork,
  'work.accept': changeWork,
  'work.cancel': changeWork,
  'message.send': sendMessage,
  'message.ack': acknowledge,
  'layout.save': (ctx, _actor, c) => saveLayout(ctx, c),
  'approval.decide': (ctx, actor, c) =>
    decideApproval(ctx, actor, c.projectId, c.expectedVersion, c.data),
  'knowledge.approve': approveKnowledge,
  'knowledge.propose': proposeKnowledge,
};

/** Runs the one handler of `c.type` and returns what it produced (before secrets are redacted for storage). */
export function runCommand(ctx: Context, actor: Actor, c: Command): Result {
  // The table pairs each type with its own narrowed command; TypeScript cannot correlate `c.type` with the entry.
  const handler = HANDLERS[c.type] as (ctx: Context, actor: Actor, c: Command) => Result;
  return handler(ctx, actor, c);
}

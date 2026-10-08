import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { assertTransition, DomainError, supports } from '@aether/kernel';
import { agent, type Context, type task } from '../domain/context.js';
import { stepConstraint } from '../runtime/step-constraint.js';

type StartCommand = Extract<Command, { type: 'work.assign' | 'work.retry' }>;
export type WorkRow = ReturnType<typeof task>;
type AssignedAgent = ReturnType<typeof agent>;

/** The run a retry continues from. */
type PreviousRun = {
  id: string;
  state: string;
  machineId: string | null;
  workspaceId: string | null;
  providerSessionId: string | null;
  provider: string;
};

type Policy = { liveEnabled: number; maxTurns: number; timeoutMs: number };

const RETRYABLE = ['failed', 'changes_requested'];

const previousRun = (ctx: Context, workId: string) =>
  ctx.sqlite
    .prepare(
      "SELECT id,state,machineId,workspaceId,providerSessionId,provider FROM runs WHERE workId=? AND purpose='implementation' ORDER BY createdAt DESC,rowid DESC LIMIT 1",
    )
    .get(workId) as PreviousRun | undefined;

/** What must hold before an agent is picked: no run or workspace job in flight, and for a retry a finished run to continue. */
function assertNothingInFlight(
  ctx: Context,
  c: StartCommand,
  row: WorkRow,
): PreviousRun | undefined {
  const retry = c.type === 'work.retry';
  if (retry && !RETRYABLE.includes(row.state)) throw new DomainError('INVALID_TRANSITION');
  if (retry && !row.assignee) throw new DomainError('WORK_NOT_ASSIGNED');
  if (
    ctx.sqlite
      .prepare(
        "SELECT 1 FROM runs WHERE workId=? AND state IN ('queued','claimed','running','cancel_requested','indeterminate')",
      )
      .get(row.id)
  )
    throw new DomainError('WORK_RUN_BUSY');
  const previous = retry ? previousRun(ctx, row.id) : undefined;
  if (retry && (!previous || !['failed', 'submitted'].includes(previous.state)))
    throw new DomainError('PREVIOUS_RUN_NOT_TERMINAL');
  if (
    retry &&
    ctx.sqlite
      .prepare(
        "SELECT 1 FROM runner_jobs WHERE workId=? AND state IN ('queued','running','indeterminate')",
      )
      .get(row.id)
  )
    throw new DomainError('WORKSPACE_JOB_PENDING');
  return previous;
}

/** A retry keeps its workspace and, on request, its provider session: both need the same machine and provider. */
function assertRetryContinues(
  ctx: Context,
  c: StartCommand,
  row: WorkRow,
  assigned: AssignedAgent,
  previous: PreviousRun | undefined,
) {
  if (c.type === 'work.retry' && assigned.mode === 'live' && !previous?.workspaceId)
    throw new DomainError('RETRY_WORKSPACE_REQUIRED');
  if (
    previous?.workspaceId &&
    !ctx.sqlite
      .prepare(
        'SELECT 1 FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.id=? AND w.workId=? AND w.projectId=? AND w.machineId=? AND m.revokedAt IS NULL',
      )
      .get(previous.workspaceId, row.id, c.projectId, previous.machineId)
  )
    throw new DomainError('RETRY_MACHINE_UNAVAILABLE');
  if (c.type !== 'work.retry' || !c.data.resume) return;
  if (!supports(assigned.provider, 'resume')) throw new DomainError('CAPABILITY_UNSUPPORTED');
  if (
    assigned.mode !== 'live' ||
    previous?.provider !== assigned.provider ||
    !previous?.providerSessionId
  )
    throw new DomainError('SESSION_RESUME_UNAVAILABLE');
}

/** The remaining gates once the agent is known; returns the project's live-execution policy. */
function assertCanStart(
  ctx: Context,
  c: StartCommand,
  row: WorkRow,
  assigned: AssignedAgent,
): Policy | undefined {
  if (assigned.mode === 'observe') throw new DomainError('OBSERVE_READ_ONLY', 403);
  assertTransition(row.state, c.type === 'work.retry' ? 'ready' : 'assigned');
  const unready = ctx.sqlite
    .prepare(
      "SELECT 1 FROM task_dependencies d JOIN work_items w ON w.id=d.dependsOn WHERE d.workId=? AND w.state<>'completed' LIMIT 1",
    )
    .get(row.id);
  if (unready) throw new DomainError('DEPENDENCIES_NOT_COMPLETE');
  if (row.attempt >= row.maxAttempts) throw new DomainError('ATTEMPT_LIMIT_REQUIRES_ESCALATION');
  const policy = ctx.sqlite
    .prepare('SELECT liveEnabled,maxTurns,timeoutMs FROM project_policies WHERE projectId=?')
    .get(c.projectId) as Policy | undefined;
  if (assigned.mode === 'live' && !policy?.liveEnabled)
    throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
  return policy;
}

/** Creates the session, the queued run and its runner command; a retry reuses the previous workspace. */
function queueRun(
  ctx: Context,
  c: StartCommand,
  row: WorkRow,
  assigned: AssignedAgent,
  previous: PreviousRun | undefined,
  policy: Policy | undefined,
  now: number,
) {
  const runId = randomUUID(),
    commandId = randomUUID(),
    sessionId = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO agent_sessions(id,projectId,agentId,provider,state,createdAt) VALUES (?,?,?,?,?,?)',
    )
    .run(sessionId, c.projectId, assigned.id, assigned.provider, 'starting', now);
  ctx.sqlite
    .prepare(
      'INSERT INTO runs(id,projectId,workId,agentId,provider,mode,state,epoch,createdAt,sessionId,maxTurns,timeoutMs) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)',
    )
    .run(
      runId,
      c.projectId,
      row.id,
      assigned.id,
      assigned.provider,
      assigned.mode,
      'queued',
      now,
      sessionId,
      policy?.maxTurns ?? 3,
      policy?.timeoutMs ?? 120000,
    );
  ctx.sqlite
    .prepare('INSERT INTO runner_commands(id,runId,projectId,epoch,createdAt) VALUES (?,?,?,1,?)')
    .run(commandId, runId, c.projectId, now);
  if (previous?.workspaceId) {
    ctx.sqlite
      .prepare('UPDATE runs SET machineId=?,workspaceId=? WHERE id=?')
      .run(previous.machineId, previous.workspaceId, runId);
    ctx.sqlite
      .prepare('UPDATE agent_sessions SET workspaceId=? WHERE id=?')
      .run(previous.workspaceId, sessionId);
  }
  if (c.type === 'work.retry' && c.data.resume)
    ctx.sqlite
      .prepare('UPDATE runs SET resumeSessionId=? WHERE id=?')
      .run(previous?.providerSessionId, runId);
}

/** work.assign and work.retry: validates, queues a run and returns the work item's next fields. */
export function startAttempt(ctx: Context, c: StartCommand, row: WorkRow, now: number) {
  const previous = assertNothingInFlight(ctx, c, row);
  const agentId = c.type === 'work.assign' ? c.data.agentId : row.assignee;
  if (!agentId) throw new DomainError('WORK_NOT_ASSIGNED');
  const assigned = agent(ctx, c.projectId, agentId);
  const required = stepConstraint(ctx, row.id)?.engineerProvider;
  if (required && assigned.provider !== required)
    throw new DomainError('WORKFLOW_PROVIDER_MISMATCH', 409);
  assertRetryContinues(ctx, c, row, assigned, previous);
  const policy = assertCanStart(ctx, c, row, assigned);
  queueRun(ctx, c, row, assigned, previous, policy, now);
  return {
    state: 'assigned' as const,
    assignee: assigned.id,
    attempt: row.attempt + 1,
    result: null,
    submittedBy: null,
    headSha: null,
    reviewBy: null,
    verifiedSha: null,
  };
}

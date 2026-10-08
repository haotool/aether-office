import { randomUUID } from 'node:crypto';
import { runnerEventSchema, type RunnerEvent } from '@aether/contracts';
import { authorize, DomainError, type Actor } from '@aether/kernel';
import { recordProvider } from '../runtime/provider-events.js';
import { emit, type Context } from '../domain/context.js';
import { machine } from './runner-machine.js';

/** What a runner reports about a run (workspace, start, activity, result), applied to the control plane's rows. */
type RunRow = {
  id: string;
  epoch: number;
  projectId: string;
  agentId: string;
  workId: string;
  state: string;
  mode: string;
  sessionId: string | null;
  providerSessionId: string | null;
  workspaceId: string | null;
  resumeSessionId: string | null;
  purpose: string;
  reviewHead: string | null;
  reviewVersion: number | null;
};
type MachineRow = ReturnType<typeof machine>['row'];
type Report<T extends RunnerEvent['type']> = Extract<RunnerEvent, { type: T }>;

/** The runner reports the workspace it made for a run: bound to the run's work, under a root the machine was granted. */
function adoptWorkspace(ctx: Context, row: MachineRow, run: RunRow, e: Report<'workspace'>) {
  const w = e.workspace;
  if (
    run.workspaceId ||
    !['claimed', 'cancel_requested', 'indeterminate'].includes(run.state) ||
    w.projectId !== run.projectId ||
    w.workId !== run.workId
  )
    throw new DomainError('WORKSPACE_SCOPE_MISMATCH');
  if (run.purpose === 'review' && w.baseSha !== run.reviewHead)
    throw new DomainError('REVIEW_HEAD_MISMATCH');
  // A machine may only report workspaces under the roots it was granted (none = unrestricted local machine).
  const roots = JSON.parse(row.allowedRoots) as string[];
  if (
    roots.length &&
    !roots.some((r) => w.path === r || w.path.startsWith(r.replace(/\/+$/, '') + '/'))
  )
    throw new DomainError('WORKSPACE_ROOT_NOT_GRANTED', 403);
  ctx.sqlite
    .prepare(
      'INSERT INTO workspaces(id,projectId,workId,machineId,repository,path,branch,baseSha,headSha,state,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      w.id,
      run.projectId,
      run.workId,
      row.id,
      w.repository,
      w.path,
      w.branch,
      w.baseSha,
      w.baseSha,
      'active',
      w.createdAt,
    );
  ctx.sqlite.prepare('UPDATE workspaces SET purpose=? WHERE id=?').run(run.purpose, w.id);
  ctx.sqlite.prepare('UPDATE runs SET workspaceId=? WHERE id=?').run(w.id, run.id);
  ctx.sqlite.prepare('UPDATE agent_sessions SET workspaceId=? WHERE id=?').run(w.id, run.sessionId);
  return 'workspace.created';
}

/** The provider session began: the run, its session, the work and the member move to running. */
function markStarted(ctx: Context, run: RunRow, e: Report<'started'>) {
  if (run.resumeSessionId && e.providerSessionId !== run.resumeSessionId)
    throw new DomainError('RESUME_SESSION_MISMATCH');
  if (
    run.providerSessionId ||
    !['claimed', 'cancel_requested', 'indeterminate'].includes(run.state)
  )
    throw new DomainError('RUN_ALREADY_STARTED');
  ctx.sqlite
    .prepare('UPDATE runs SET state=?,providerSessionId=?,processIdentity=? WHERE id=?')
    .run(
      run.state === 'claimed' ? 'running' : run.state,
      e.providerSessionId,
      e.processIdentity,
      run.id,
    );
  ctx.sqlite
    .prepare('UPDATE agent_sessions SET state=?,providerSessionId=? WHERE id=?')
    .run(run.state === 'claimed' ? 'active' : run.state, e.providerSessionId, run.sessionId);
  if (run.purpose === 'implementation')
    ctx.sqlite
      .prepare(
        "UPDATE work_items SET state='running',version=version+1,updatedAt=? WHERE id=? AND state='assigned' AND ?='claimed'",
      )
      .run(ctx.now(), run.workId, run.state);
  if (run.state === 'claimed')
    ctx.sqlite
      .prepare("UPDATE agents SET activity='working',lastSeen=?,version=version+1 WHERE id=?")
      .run(ctx.now(), run.agentId);
  return 'session.started';
}

function markActivity(ctx: Context, run: RunRow, e: Report<'activity'>) {
  if (run.state === 'running')
    ctx.sqlite
      .prepare('UPDATE agents SET activity=?,lastSeen=?,version=version+1 WHERE id=?')
      .run(e.activity, ctx.now(), run.agentId);
  return 'agent.activity.changed';
}

/** A late success never overwrites a cancellation, and a run whose outcome is unknown stays unknown. */
function settledOutcome(run: RunRow, e: Report<'result'>) {
  if (run.state === 'cancel_requested')
    return e.outcome === 'cancelled' ? 'cancelled' : 'indeterminate';
  return run.state === 'indeterminate' ? 'indeterminate' : e.outcome;
}

/** A submitted review: bound to the commit and version it was asked about; returns true when the work moved on meanwhile. */
function recordReview(ctx: Context, run: RunRow, e: Report<'result'>): boolean {
  const work = ctx.sqlite
    .prepare('SELECT state,headSha,version,assignee,reviewBy FROM work_items WHERE id=?')
    .get(run.workId) as {
    state: string;
    headSha: string;
    version: number;
    assignee: string;
    reviewBy: string | null;
  };
  const review = e.review;
  if (
    !review ||
    !run.workspaceId ||
    review.headSha !== run.reviewHead ||
    e.headSha !== run.reviewHead
  )
    throw new DomainError('REVIEW_RESULT_BINDING_MISMATCH');
  if (
    work.state !== 'reviewing' ||
    work.headSha !== run.reviewHead ||
    work.version !== run.reviewVersion ||
    work.assignee === run.agentId ||
    work.reviewBy
  )
    return true;
  ctx.sqlite
    .prepare('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)')
    .run(
      randomUUID(),
      run.workId,
      run.projectId,
      run.agentId,
      review.decision,
      review.body,
      run.reviewHead,
      ctx.now(),
    );
  ctx.sqlite
    .prepare(
      'UPDATE work_items SET reviewBy=?,state=?,verifiedSha=NULL,version=version+1,updatedAt=? WHERE id=?',
    )
    .run(
      review.decision === 'approve' ? run.agentId : null,
      review.decision === 'approve' ? 'reviewing' : 'changes_requested',
      ctx.now(),
      run.workId,
    );
  return false;
}

/** The run ended: record its outcome (a late success never overwrites a cancellation), and apply it to the work, a review, the member. */
function finishRun(ctx: Context, run: RunRow, e: Report<'result'>) {
  let stale = false;
  const outcome = settledOutcome(run, e);
  const state = outcome === 'submitted' ? 'reviewing' : outcome;
  ctx.sqlite.prepare('UPDATE runs SET state=?,result=? WHERE id=?').run(outcome, e.summary, run.id);
  ctx.sqlite
    .prepare("UPDATE agent_sessions SET state='ended',endedAt=? WHERE id=?")
    .run(ctx.now(), run.sessionId);
  if (e.headSha)
    ctx.sqlite
      .prepare('UPDATE workspaces SET headSha=? WHERE id=?')
      .run(e.headSha, run.workspaceId);
  if (run.purpose === 'implementation')
    ctx.sqlite
      .prepare(
        'UPDATE work_items SET state=?,result=?,submittedBy=?,headSha=?,version=version+1,updatedAt=? WHERE id=?',
      )
      .run(state, e.summary, run.agentId, e.headSha ?? null, ctx.now(), run.workId);
  else if (outcome === 'submitted') stale = recordReview(ctx, run, e);
  if (run.purpose === 'review' && ['cancelled', 'indeterminate'].includes(outcome))
    ctx.sqlite
      .prepare(
        "UPDATE work_items SET state=?,version=version+1,updatedAt=? WHERE id=? AND state='cancel_requested'",
      )
      .run(outcome, ctx.now(), run.workId);
  ctx.sqlite
    .prepare('UPDATE agents SET activity=?,lastSeen=?,version=version+1 WHERE id=?')
    .run(
      outcome === 'failed' ? 'error' : outcome === 'indeterminate' ? 'unknown' : 'idle',
      ctx.now(),
      run.agentId,
    );
  ctx.sqlite.prepare("UPDATE runner_commands SET state='executed' WHERE runId=?").run(run.id);
  if (stale) return 'review.result.stale';
  return run.purpose === 'review' ? 'review.result' : 'run.result';
}

export function report(ctx: Context, actor: Actor, input: unknown) {
  const { row } = machine(ctx, actor);
  const e = runnerEventSchema.parse(input);
  return ctx.sqlite
    .transaction(() => {
      const run = ctx.sqlite
        .prepare('SELECT * FROM runs WHERE id=? AND machineId=?')
        .get(e.runId, row.id) as RunRow | undefined;
      if (!run || run.epoch !== e.epoch) throw new DomainError('RUN_LEASE_MISMATCH', 403);
      authorize(actor, 'runner.report', run.projectId);
      if (
        ctx.sqlite
          .prepare('SELECT 1 FROM runner_reports WHERE sourceEventId=? AND machineId=? AND runId=?')
          .get(e.sourceEventId, row.id, run.id)
      )
        return { duplicate: true };
      if (!['claimed', 'running', 'cancel_requested', 'indeterminate'].includes(run.state))
        throw new DomainError('RUN_TERMINAL');
      ctx.sqlite
        .prepare('INSERT INTO runner_reports VALUES (?,?,?,?)')
        .run(e.sourceEventId, row.id, run.id, ctx.now());
      ctx.sqlite.prepare('UPDATE runs SET lastSeen=? WHERE id=?').run(ctx.now(), run.id);
      if (e.type === 'provider') {
        recordProvider(ctx, actor, run, e);
        return { duplicate: false };
      }
      const type =
        e.type === 'workspace'
          ? adoptWorkspace(ctx, row, run, e)
          : e.type === 'started'
            ? markStarted(ctx, run, e)
            : e.type === 'activity'
              ? markActivity(ctx, run, e)
              : finishRun(ctx, run, e);
      emit(
        ctx,
        actor,
        run.projectId,
        type,
        { ...e, workId: run.workId, agentId: run.agentId },
        e.sourceEventId,
        run.id,
        run.mode === 'demo' ? 'simulated' : 'native',
      );
      return { duplicate: false };
    })
    .immediate();
}

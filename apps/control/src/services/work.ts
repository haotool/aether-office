import { refreshMessageWaits } from './messages.js';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Command } from '@aether/contracts';
import {
  assertAcyclic,
  assertOwnedAgent,
  assertTransition,
  assertVersion,
  DomainError,
  type Actor,
} from '@aether/kernel';
import { work, dependencies } from '../db/schema.js';
import { agent, task, emit, type Context } from './context.js';
export function createWork(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'work.create' }>,
) {
  const id = randomUUID();
  const tasks = ctx.db.select().from(work).where(eq(work.projectId, c.projectId)).all();
  const edges = ctx.db
    .select()
    .from(dependencies)
    .where(eq(dependencies.projectId, c.projectId))
    .all();
  const graph = new Map(
    tasks.map((t) => [t.id, edges.filter((e) => e.workId === t.id).map((e) => e.dependsOn)]),
  );
  assertAcyclic(id, c.data.dependencies, graph);
  const ready = c.data.dependencies.every(
    (dep) => tasks.find((t) => t.id === dep)?.state === 'completed',
  );
  const row = {
    id,
    projectId: c.projectId,
    title: c.data.title,
    description: c.data.description,
    acceptance: c.data.acceptance,
    priority: c.data.priority,
    state: ready ? ('ready' as const) : ('backlog' as const),
    assignee: null,
    version: 1,
    attempt: 0,
    maxAttempts: 3,
    cancelCause: null,
    createdAt: ctx.now(),
    updatedAt: ctx.now(),
    result: null,
    submittedBy: null,
    headSha: null,
    reviewBy: null,
    verifiedSha: null,
  };
  ctx.db.insert(work).values(row).run();
  for (const dependsOn of c.data.dependencies)
    ctx.db.insert(dependencies).values({ workId: id, dependsOn, projectId: c.projectId }).run();
  return { ...row, dependencies: c.data.dependencies };
}
export function changeWork(
  ctx: Context,
  actor: Actor,
  c: Extract<
    Command,
    {
      type:
        | 'work.dependencies'
        | 'work.extend'
        | 'work.retry'
        | 'work.assign'
        | 'work.submit'
        | 'work.review'
        | 'work.accept'
        | 'work.cancel';
    }
  >,
) {
  if (actor.workId && actor.workId !== c.data.workId)
    throw new DomainError('SESSION_WORK_SCOPE', 403);
  const row = task(ctx, c.projectId, c.data.workId);
  assertVersion(row.version, c.expectedVersion);
  const now = ctx.now();
  let patch: Partial<typeof row> = { version: row.version + 1, updatedAt: now };
  if (c.type === 'work.dependencies') {
    if (row.attempt !== 0 || !['ready', 'backlog'].includes(row.state))
      throw new DomainError('WORK_DEPENDENCIES_LOCKED');
    const tasks = ctx.db.select().from(work).where(eq(work.projectId, c.projectId)).all();
    const edges = ctx.db
      .select()
      .from(dependencies)
      .where(eq(dependencies.projectId, c.projectId))
      .all();
    assertAcyclic(
      row.id,
      c.data.dependencies,
      new Map(
        tasks.map((t) => [t.id, edges.filter((e) => e.workId === t.id).map((e) => e.dependsOn)]),
      ),
    );
    const state = c.data.dependencies.every(
      (id) => tasks.find((t) => t.id === id)?.state === 'completed',
    )
      ? 'ready'
      : 'backlog';
    if (state !== row.state) assertTransition(row.state, state);
    ctx.sqlite.prepare('DELETE FROM task_dependencies WHERE workId=?').run(row.id);
    for (const dependsOn of c.data.dependencies)
      ctx.db
        .insert(dependencies)
        .values({ workId: row.id, dependsOn, projectId: c.projectId })
        .run();
    patch = { ...patch, state };
  } else if (c.type === 'work.extend') {
    if (!['failed', 'changes_requested'].includes(row.state) || row.attempt < row.maxAttempts)
      throw new DomainError('ATTEMPT_LIMIT_NOT_REACHED');
    if (row.maxAttempts >= 100) throw new DomainError('ABSOLUTE_ATTEMPT_LIMIT');
    patch = { ...patch, maxAttempts: row.maxAttempts + 1 };
  } else if (c.type === 'work.assign' || c.type === 'work.retry') {
    const retry = c.type === 'work.retry';
    if (retry && !['failed', 'changes_requested'].includes(row.state))
      throw new DomainError('INVALID_TRANSITION');
    if (retry && !row.assignee) throw new DomainError('WORK_NOT_ASSIGNED');
    if (
      ctx.sqlite
        .prepare(
          "SELECT 1 FROM runs WHERE workId=? AND state IN ('queued','claimed','running','cancel_requested','indeterminate')",
        )
        .get(row.id)
    )
      throw new DomainError('WORK_RUN_BUSY');
    const previous = retry
      ? (ctx.sqlite
          .prepare(
            "SELECT id,state,machineId,workspaceId,providerSessionId,provider FROM runs WHERE workId=? AND purpose='implementation' ORDER BY createdAt DESC,rowid DESC LIMIT 1",
          )
          .get(row.id) as
          | {
              id: string;
              state: string;
              machineId: string | null;
              workspaceId: string | null;
              providerSessionId: string | null;
              provider: string;
            }
          | undefined)
      : undefined;
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
    const assigned = agent(
      ctx,
      c.projectId,
      c.type === 'work.assign' ? c.data.agentId : row.assignee!,
    );
    if (retry && assigned.mode === 'live' && !previous?.workspaceId)
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
    if (
      c.type === 'work.retry' &&
      c.data.resume &&
      (assigned.mode !== 'live' ||
        !['codex', 'claude'].includes(assigned.provider) ||
        previous?.provider !== assigned.provider ||
        !previous?.providerSessionId)
    )
      throw new DomainError('SESSION_RESUME_UNAVAILABLE');
    if (assigned.mode === 'observe') throw new DomainError('OBSERVE_READ_ONLY', 403);
    if (retry) assertTransition(row.state, 'ready');
    else assertTransition(row.state, 'assigned');
    const unready = ctx.sqlite
      .prepare(
        "SELECT 1 FROM task_dependencies d JOIN work_items w ON w.id=d.dependsOn WHERE d.workId=? AND w.state<>'completed' LIMIT 1",
      )
      .get(row.id);
    if (unready) throw new DomainError('DEPENDENCIES_NOT_COMPLETE');
    if (row.attempt >= row.maxAttempts) throw new DomainError('ATTEMPT_LIMIT_REQUIRES_ESCALATION');
    const policy = ctx.sqlite
      .prepare('SELECT liveEnabled,maxTurns,timeoutMs FROM project_policies WHERE projectId=?')
      .get(c.projectId) as { liveEnabled: number; maxTurns: number; timeoutMs: number } | undefined;
    if (assigned.mode === 'live' && !policy?.liveEnabled)
      throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
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
        .run(previous!.providerSessionId, runId);
    patch = {
      ...patch,
      state: 'assigned',
      assignee: assigned.id,
      attempt: row.attempt + 1,
      result: null,
      submittedBy: null,
      headSha: null,
      reviewBy: null,
      verifiedSha: null,
    };
  } else if (c.type === 'work.submit') {
    if (!row.assignee) throw new DomainError('WORK_NOT_ASSIGNED');
    assertOwnedAgent(actor, row.assignee);
    assertTransition(row.state, 'reviewing');
    patch = {
      ...patch,
      state: 'reviewing',
      result: c.data.result,
      submittedBy: actor.id,
      headSha: c.data.headSha ?? null,
      verifiedSha: null,
      reviewBy: null,
    };
  } else if (c.type === 'work.review') {
    if (row.state !== 'reviewing') throw new DomainError('INVALID_TRANSITION');
    if (row.submittedBy === actor.id || (actor.agentId && actor.agentId === row.assignee))
      throw new DomainError('SELF_REVIEW_FORBIDDEN', 403);
    ctx.sqlite
      .prepare('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        row.id,
        c.projectId,
        actor.id,
        c.data.decision,
        c.data.body,
        row.headSha,
        now,
      );
    patch = {
      ...patch,
      reviewBy: c.data.decision === 'approve' ? actor.id : null,
      ...(c.data.decision === 'changes_requested'
        ? { state: 'changes_requested' as const, verifiedSha: null }
        : {}),
    };
  } else if (c.type === 'work.accept') {
    assertTransition(row.state, 'completed');
    if (!row.reviewBy || !row.headSha || row.verifiedSha !== row.headSha)
      throw new DomainError('VERIFICATION_REQUIRED');
    patch = { ...patch, state: 'completed' };
  } else {
    const next = [
      'backlog',
      'ready',
      'blocked',
      'changes_requested',
      'failed',
      'verified',
    ].includes(row.state)
      ? 'cancelled'
      : 'cancel_requested';
    assertTransition(row.state, next);
    patch = { ...patch, state: next };
    // A queued command has no side effects. Claimed/running work needs the owning runner's cancellation acknowledgement.
    const run = ctx.sqlite
      .prepare(
        "SELECT id,state FROM runs WHERE workId=? AND state IN ('queued','claimed','running')",
      )
      .get(row.id) as { id: string; state: string } | undefined;
    if (run?.state === 'queued') {
      ctx.sqlite.prepare("UPDATE runs SET state='cancelled' WHERE id=?").run(run.id);
      ctx.sqlite.prepare("UPDATE runner_commands SET state='cancelled' WHERE runId=?").run(run.id);
      patch.state = 'cancelled';
    } else if (run)
      ctx.sqlite.prepare("UPDATE runs SET state='cancel_requested' WHERE id=?").run(run.id);
    else if (
      !ctx.sqlite
        .prepare("SELECT 1 FROM runner_jobs WHERE workId=? AND state='running'")
        .get(row.id)
    )
      patch.state = 'cancelled';
    ctx.sqlite
      .prepare(
        "UPDATE runner_jobs SET state='failed',result=?,finishedAt=? WHERE workId=? AND state='queued'",
      )
      .run(JSON.stringify({ error: 'WORK_CANCELLED' }), now, row.id);
    const waiting = ctx.sqlite
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
      SELECT workId FROM task_dependencies WHERE projectId=? AND dependsOn=?
      UNION SELECT d.workId FROM task_dependencies d JOIN descendants p ON d.dependsOn=p.id WHERE d.projectId=?
    ) SELECT w.id,w.version FROM work_items w JOIN descendants d ON d.id=w.id
      WHERE w.projectId=? AND w.attempt=0 AND w.state IN ('backlog','ready','blocked')
      AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.workId=w.id AND r.state IN ('queued','claimed','running','cancel_requested','indeterminate'))
      ORDER BY w.createdAt,w.id`,
      )
      .all(c.projectId, row.id, c.projectId, c.projectId) as { id: string; version: number }[];
    for (const child of waiting) {
      ctx.sqlite
        .prepare(
          "UPDATE work_items SET state='cancelled',cancelCause=?,version=version+1,updatedAt=? WHERE id=?",
        )
        .run(row.id, now, child.id);
      emit(
        ctx,
        actor,
        c.projectId,
        'work.dependency.cancelled',
        { workId: child.id, cancelCause: row.id, state: 'cancelled', version: child.version + 1 },
        c.idempotencyKey,
        c.correlationId,
        ctx.mode === 'demo' ? 'simulated' : 'command',
      );
    }
  }
  ctx.db.update(work).set(patch).where(eq(work.id, row.id)).run();
  if (c.type === 'work.cancel') refreshMessageWaits(ctx, c.projectId);
  if (patch.state === 'completed') {
    ctx.sqlite
      .prepare(
        "UPDATE work_items SET state='ready',version=version+1,updatedAt=? WHERE projectId=? AND state='backlog' AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN work_items w ON w.id=d.dependsOn WHERE d.workId=work_items.id AND w.state<>'completed')",
      )
      .run(now, c.projectId);
  }
  return {
    ...task(ctx, c.projectId, row.id),
    ...(c.type === 'work.extend' ? { extensionReason: c.data.reason, approvedBy: actor.id } : {}),
    ...(c.type === 'work.dependencies' ? { dependencies: c.data.dependencies } : {}),
  };
}

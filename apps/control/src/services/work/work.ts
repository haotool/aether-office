import { refreshMessageWaits } from '../domain/messages.js';
import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import {
  assertAcyclic,
  assertOwnedAgent,
  assertTransition,
  assertVersion,
  DomainError,
  type Actor,
} from '@aether/kernel';
import { insertRow, selectAll, updateRows } from '../../db/query.js';
import { work, dependencies } from '../../db/schema.js';
import { task, type Context } from '../domain/context.js';
import { cancelWork } from './work-cancel.js';
import { startAttempt, type WorkRow } from './work-start.js';
export function createWork(ctx: Context, c: Extract<Command, { type: 'work.create' }>) {
  const id = randomUUID();
  const tasks = selectAll(ctx.sqlite, work, { projectId: c.projectId });
  const edges = selectAll(ctx.sqlite, dependencies, { projectId: c.projectId });
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
  insertRow(ctx.sqlite, work, row);
  for (const dependsOn of c.data.dependencies)
    insertRow(ctx.sqlite, dependencies, { workId: id, dependsOn, projectId: c.projectId });
  return { ...row, dependencies: c.data.dependencies };
}
type ChangeCommand = Extract<
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
>;
type Patch = Partial<WorkRow>;

function replaceDependencies(
  ctx: Context,
  c: Extract<Command, { type: 'work.dependencies' }>,
  row: WorkRow,
): Patch {
  if (row.attempt !== 0 || !['ready', 'backlog'].includes(row.state))
    throw new DomainError('WORK_DEPENDENCIES_LOCKED');
  const tasks = selectAll(ctx.sqlite, work, { projectId: c.projectId });
  const edges = selectAll(ctx.sqlite, dependencies, { projectId: c.projectId });
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
    insertRow(ctx.sqlite, dependencies, { workId: row.id, dependsOn, projectId: c.projectId });
  return { state };
}

function extendAttempts(row: WorkRow): Patch {
  if (!['failed', 'changes_requested'].includes(row.state) || row.attempt < row.maxAttempts)
    throw new DomainError('ATTEMPT_LIMIT_NOT_REACHED');
  if (row.maxAttempts >= 100) throw new DomainError('ABSOLUTE_ATTEMPT_LIMIT');
  return { maxAttempts: row.maxAttempts + 1 };
}

function submitWork(
  actor: Actor,
  c: Extract<Command, { type: 'work.submit' }>,
  row: WorkRow,
): Patch {
  if (!row.assignee) throw new DomainError('WORK_NOT_ASSIGNED');
  assertOwnedAgent(actor, row.assignee);
  assertTransition(row.state, 'reviewing');
  return {
    state: 'reviewing',
    result: c.data.result,
    submittedBy: actor.id,
    headSha: c.data.headSha ?? null,
    verifiedSha: null,
    reviewBy: null,
  };
}

function reviewWork(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'work.review' }>,
  row: WorkRow,
  now: number,
): Patch {
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
  return {
    reviewBy: c.data.decision === 'approve' ? actor.id : null,
    ...(c.data.decision === 'changes_requested'
      ? { state: 'changes_requested' as const, verifiedSha: null }
      : {}),
  };
}

function acceptWork(row: WorkRow): Patch {
  assertTransition(row.state, 'completed');
  if (!row.reviewBy || !row.headSha || row.verifiedSha !== row.headSha)
    throw new DomainError('VERIFICATION_REQUIRED');
  return { state: 'completed' };
}

/** The fields one command changes on the work item, after running its side effects. */
function stepPatch(ctx: Context, actor: Actor, c: ChangeCommand, row: WorkRow, now: number): Patch {
  switch (c.type) {
    case 'work.dependencies':
      return replaceDependencies(ctx, c, row);
    case 'work.extend':
      return extendAttempts(row);
    case 'work.assign':
    case 'work.retry':
      return startAttempt(ctx, c, row, now);
    case 'work.submit':
      return submitWork(actor, c, row);
    case 'work.review':
      return reviewWork(ctx, actor, c, row, now);
    case 'work.accept':
      return acceptWork(row);
    case 'work.cancel':
      return cancelWork(ctx, actor, c, row, now);
  }
}

export function changeWork(ctx: Context, actor: Actor, c: ChangeCommand) {
  if (actor.workId && actor.workId !== c.data.workId)
    throw new DomainError('SESSION_WORK_SCOPE', 403);
  const row = task(ctx, c.projectId, c.data.workId);
  assertVersion(row.version, c.expectedVersion);
  const now = ctx.now();
  const patch: Patch = {
    version: row.version + 1,
    updatedAt: now,
    ...stepPatch(ctx, actor, c, row, now),
  };
  // A retry is two policy steps (changes_requested|failed -> ready -> assigned); the DB guard
  // rejects the shortcut.
  if (c.type === 'work.retry')
    ctx.sqlite.prepare("UPDATE work_items SET state='ready' WHERE id=?").run(row.id);
  updateRows(ctx.sqlite, work, { id: row.id }, patch);
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

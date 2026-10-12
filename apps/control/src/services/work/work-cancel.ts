import type { Command } from '@aether/contracts';
import { assertTransition, type Actor } from '@aether/kernel';
import { emit, type Context } from '../domain/context.js';
import type { WorkRow } from './work-start.js';

type CancelCommand = Extract<Command, { type: 'work.cancel' }>;

const NOT_RUNNING = [
  'backlog',
  'ready',
  'blocked',
  'changes_requested',
  'failed',
  'verified',
  'indeterminate', // a human closes a run whose outcome is unknown; the platform never guesses
];

function cancelRun(ctx: Context, row: WorkRow): boolean {
  const run = ctx.sqlite
    .prepare("SELECT id,state FROM runs WHERE workId=? AND state IN ('queued','claimed','running')")
    .get(row.id) as { id: string; state: string } | undefined;
  // Closing an unknown outcome also retires its run, so it can never be mistaken for live work.
  if (row.state === 'indeterminate')
    ctx.sqlite
      .prepare("UPDATE runs SET state='cancelled' WHERE workId=? AND state='indeterminate'")
      .run(row.id);
  if (run?.state === 'queued') {
    ctx.sqlite.prepare("UPDATE runs SET state='cancelled' WHERE id=?").run(run.id);
    ctx.sqlite.prepare("UPDATE runner_commands SET state='cancelled' WHERE runId=?").run(run.id);
    return true;
  }
  if (run) {
    ctx.sqlite.prepare("UPDATE runs SET state='cancel_requested' WHERE id=?").run(run.id);
    return false;
  }
  return !ctx.sqlite
    .prepare("SELECT 1 FROM runner_jobs WHERE workId=? AND state='running'")
    .get(row.id);
}

/** Work that was only waiting for the cancelled item can never start: cancel it too, with the cause recorded. */
function cancelWaitingDescendants(
  ctx: Context,
  actor: Actor,
  c: CancelCommand,
  row: WorkRow,
  now: number,
) {
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

export function cancelWork(
  ctx: Context,
  actor: Actor,
  c: CancelCommand,
  row: WorkRow,
  now: number,
) {
  const next: WorkRow['state'] = NOT_RUNNING.includes(row.state) ? 'cancelled' : 'cancel_requested';
  assertTransition(row.state, next);
  const state = cancelRun(ctx, row) ? 'cancelled' : next;
  ctx.sqlite
    .prepare(
      "UPDATE runner_jobs SET state='failed',result=?,finishedAt=? WHERE workId=? AND state='queued'",
    )
    .run(JSON.stringify({ error: 'WORK_CANCELLED' }), now, row.id);
  cancelWaitingDescendants(ctx, actor, c, row, now);
  return { state };
}

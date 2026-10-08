import { randomUUID } from 'node:crypto';
import { scheduleSchema, type Command, type Schedule } from '@aether/contracts';
import {
  assertVersion,
  DomainError,
  dueDecision,
  isValidSpec,
  isValidTimezone,
  nextRun,
  type Actor,
  type ScheduleSpec,
} from '@aether/kernel';
import { emit, type Context } from './context.js';
import { identityActor } from './identity.js';
import { createWork } from '../work/work.js';

const MAX_PER_PROJECT = 50;
const BATCH = 50;

type Row = {
  id: string;
  projectId: string;
  name: string;
  spec: string;
  timezone: string;
  missed: 'skip' | 'single';
  template: string;
  enabled: number;
  nextRunAt: number | null;
  lastOccurrence: number | null;
  createdBy: string;
  version: number;
};

const view = (row: Row): Schedule =>
  scheduleSchema.parse({
    ...row,
    spec: JSON.parse(row.spec),
    template: JSON.parse(row.template),
    enabled: row.enabled === 1,
  });

export function listSchedules(ctx: Context, projectId: string): Schedule[] {
  return (
    ctx.sqlite
      .prepare('SELECT * FROM schedules WHERE projectId=? ORDER BY createdAt,id')
      .all(projectId) as Row[]
  ).map(view);
}

export function scheduleCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'schedule.create' | 'schedule.toggle' }>,
): Record<string, unknown> {
  const now = ctx.now();
  if (c.type === 'schedule.create') {
    const spec = c.data.spec as ScheduleSpec;
    if (!isValidTimezone(c.data.timezone)) throw new DomainError('SCHEDULE_TIMEZONE_INVALID', 400);
    if (!isValidSpec(spec)) throw new DomainError('SCHEDULE_SPEC_INVALID', 400);
    const first = nextRun(spec, now, c.data.timezone);
    if (first === null) throw new DomainError('SCHEDULE_IN_THE_PAST', 400);
    const count = ctx.sqlite
      .prepare('SELECT COUNT(*) AS n FROM schedules WHERE projectId=?')
      .get(c.projectId) as { n: number };
    if (count.n >= MAX_PER_PROJECT) throw new DomainError('SCHEDULE_LIMIT', 429);
    const id = randomUUID();
    ctx.sqlite
      .prepare(
        'INSERT INTO schedules(id,projectId,name,spec,timezone,missed,template,enabled,nextRunAt,createdBy,version,createdAt) VALUES (?,?,?,?,?,?,?,1,?,?,1,?)',
      )
      .run(
        id,
        c.projectId,
        c.data.name,
        JSON.stringify(spec),
        c.data.timezone,
        c.data.missed,
        JSON.stringify(c.data.template),
        first,
        actor.id,
        now,
      );
    return view(ctx.sqlite.prepare('SELECT * FROM schedules WHERE id=?').get(id) as Row);
  }
  const row = ctx.sqlite
    .prepare('SELECT * FROM schedules WHERE id=? AND projectId=?')
    .get(c.data.scheduleId, c.projectId) as Row | undefined;
  if (!row) throw new DomainError('SCHEDULE_NOT_FOUND', 404);
  assertVersion(row.version, c.expectedVersion);
  // Re-enabling never replays what was missed while off: the next run is computed from now.
  const next = c.data.enabled
    ? nextRun(JSON.parse(row.spec) as ScheduleSpec, now, row.timezone)
    : row.nextRunAt;
  ctx.sqlite
    .prepare('UPDATE schedules SET enabled=?,nextRunAt=?,version=version+1 WHERE id=?')
    .run(c.data.enabled ? 1 : 0, next, row.id);
  return view(ctx.sqlite.prepare('SELECT * FROM schedules WHERE id=?').get(row.id) as Row);
}

/** Creates the work item for one claimed occurrence; a revoked creator or a template gone invalid stops the schedule. */
function dispatchOccurrence(ctx: Context, row: Row, occurrence: number): boolean {
  try {
    const actor = identityActor(ctx, row.createdBy);
    const template = JSON.parse(row.template) as Schedule['template'];
    const key = `schedule:${row.id}:${occurrence}`;
    const work = createWork(ctx, {
      schemaVersion: 1,
      type: 'work.create',
      projectId: row.projectId,
      idempotencyKey: key,
      correlationId: key,
      data: { ...template, dependencies: [] },
    } as Extract<Command, { type: 'work.create' }>);
    ctx.sqlite
      .prepare('UPDATE schedule_runs SET workId=? WHERE scheduleId=? AND occurrence=?')
      .run(work.id, row.id, occurrence);
    emit(
      ctx,
      actor,
      row.projectId,
      'schedule.dispatched',
      { scheduleId: row.id, occurrence, workId: work.id },
      key,
      key,
      'command',
    );
    return true;
  } catch {
    // The creator was revoked or the template became invalid: record it and stop the schedule.
    ctx.sqlite
      .prepare("UPDATE schedule_runs SET outcome='failed' WHERE scheduleId=? AND occurrence=?")
      .run(row.id, occurrence);
    ctx.sqlite.prepare('UPDATE schedules SET enabled=0 WHERE id=?').run(row.id);
    return false;
  }
}

/**
 * Dispatches due schedules. An occurrence is claimed by inserting into schedule_runs first, so a
 * restart, a retry or a second ticker cannot create the same work twice. Dispatch only creates a
 * WorkItem: it never assigns an agent, so a schedule cannot spend model budget on its own.
 */
export function tickSchedules(ctx: Context): number {
  const now = ctx.now();
  const due = ctx.sqlite
    .prepare(
      'SELECT * FROM schedules WHERE enabled=1 AND nextRunAt IS NOT NULL AND nextRunAt<=? ORDER BY nextRunAt LIMIT ?',
    )
    .all(now, BATCH) as Row[];
  let dispatched = 0;
  for (const row of due) {
    const dueAt = row.nextRunAt;
    if (dueAt === null) continue;
    ctx.sqlite
      .transaction(() => {
        const spec = JSON.parse(row.spec) as ScheduleSpec;
        const decision = dueDecision(spec, row.timezone, dueAt, now, row.missed);
        const claimed = ctx.sqlite
          .prepare(
            'INSERT OR IGNORE INTO schedule_runs(scheduleId,occurrence,outcome,createdAt) VALUES (?,?,?,?)',
          )
          .run(row.id, decision.occurrence, decision.dispatch ? 'dispatched' : 'skipped', now);
        if (claimed.changes === 1 && decision.dispatch)
          if (dispatchOccurrence(ctx, row, decision.occurrence)) dispatched += 1;
        ctx.sqlite
          .prepare('UPDATE schedules SET nextRunAt=?,lastOccurrence=?,version=version+1 WHERE id=?')
          .run(decision.nextAt, decision.occurrence, row.id);
      })
      .immediate();
  }
  return dispatched;
}

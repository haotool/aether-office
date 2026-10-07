import type { Actor } from '@aether/kernel';
import { project, task, type Context } from './context.js';
import { identityActor } from './identity.js';
type RunRow = {
  id: string;
  state: string;
  machineId: string | null;
  lastSeen: number | null;
  createdAt: number;
  revokedAt: number | null;
};

/** Why a running run is or is not making progress: a waiting approval, a peer, or how recent its events are. */
function runningReason(ctx: Context, projectId: string, run: RunRow, now: number): string {
  const approval = ctx.sqlite
    .prepare(
      "SELECT state,expiresAt FROM approval_decisions WHERE runId=? AND state IN ('pending','decided','decision_sent') ORDER BY expiresAt DESC LIMIT 1",
    )
    .get(run.id) as { state: string; expiresAt: number } | undefined;
  const activity = ctx.sqlite
    .prepare(
      "SELECT json_extract(payload,'$.activity') AS activity FROM events WHERE projectId=? AND correlationId=? AND type IN ('agent.activity.changed','tool.started','tool.completed','tool.failed','assistant.message','turn.started','turn.completed','turn.failed') ORDER BY seq DESC LIMIT 1",
    )
    .get(projectId, run.id) as { activity: string } | undefined;
  if (approval)
    return approval.expiresAt <= now
      ? 'approval_expired'
      : approval.state === 'pending'
        ? 'awaiting_permission'
        : 'awaiting_provider_ack';
  if (activity?.activity === 'waiting_peer') return 'awaiting_peer';
  return now - (run.lastSeen ?? run.createdAt) >= 60000 ? 'no_recent_events' : 'recent_events';
}

/** The latest run's state, refined for a live one by its machine and, when running, by what it is waiting for. */
function reasonFor(
  ctx: Context,
  projectId: string,
  run: RunRow,
  machineOnline: boolean,
  now: number,
): string {
  if (!['claimed', 'running', 'cancel_requested', 'queued'].includes(run.state)) return run.state;
  if (run.revokedAt !== null) return 'machine_revoked';
  if (run.machineId && !machineOnline) return 'machine_offline';
  return run.state === 'running' ? runningReason(ctx, projectId, run, now) : run.state;
}

export function diagnoseWork(ctx: Context, actor: Actor, projectId: string, workId: string) {
  actor = identityActor(ctx, actor.id);
  project(ctx, actor, projectId);
  const work = task(ctx, projectId, workId);
  const now = ctx.now();
  const run = ctx.sqlite
    .prepare(
      'SELECT r.id,r.state,r.mode,r.machineId,r.lastSeen,r.createdAt,m.lastSeen AS heartbeatAt,m.revokedAt FROM runs r LEFT JOIN machines m ON m.id=r.machineId WHERE r.workId=? ORDER BY r.createdAt DESC,r.rowid DESC LIMIT 1',
    )
    .get(workId) as
    | {
        id: string;
        state: string;
        mode: string;
        machineId: string | null;
        lastSeen: number | null;
        createdAt: number;
        heartbeatAt: number | null;
        revokedAt: number | null;
      }
    | undefined;
  const machineOnline =
    !!run?.machineId &&
    run.revokedAt === null &&
    run.heartbeatAt !== null &&
    now - run.heartbeatAt <= 45000;
  const reason = run ? reasonFor(ctx, projectId, run, machineOnline, now) : 'no_run';
  return {
    workId,
    workState: work.state,
    reason,
    checkedAt: now,
    runId: run?.id ?? null,
    mode: run?.mode ?? null,
    machineId: run?.machineId ?? null,
    machineOnline,
    heartbeatAt: run?.heartbeatAt ?? null,
    lastEventAt: run?.lastSeen ?? null,
    queuedAt: run?.createdAt ?? null,
    rateLimitEvidence: null,
  };
}

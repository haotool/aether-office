import { emit, type Context } from '../domain/context.js';

export function reconcileOffline(ctx: Context): number {
  return ctx.sqlite
    .transaction(() => {
      const stale = ctx.sqlite
        .prepare(
          "SELECT r.* FROM runs r JOIN machines m ON m.id=r.machineId WHERE r.state IN ('claimed','running','cancel_requested') AND m.lastSeen<?",
        )
        .all(ctx.now() - 45000) as {
        id: string;
        projectId: string;
        agentId: string;
        workId: string;
        machineId: string;
        purpose: string;
      }[];
      for (const r of stale) {
        ctx.sqlite.prepare("UPDATE runs SET state='indeterminate' WHERE id=?").run(r.id);
        if (r.purpose === 'implementation')
          ctx.sqlite
            .prepare(
              "UPDATE work_items SET state='indeterminate',version=version+1,updatedAt=? WHERE id=?",
            )
            .run(ctx.now(), r.workId);
        ctx.sqlite
          .prepare("UPDATE agents SET activity='unknown',version=version+1 WHERE id=?")
          .run(r.agentId);
        emit(
          ctx,
          { id: 'system', role: 'owner', projectIds: [] },
          r.projectId,
          'runner.disconnected',
          { runId: r.id, agentId: r.agentId, workId: r.workId },
          r.id,
          r.id,
        );
      }
      ctx.sqlite
        .prepare(
          "UPDATE runner_jobs SET state='indeterminate' WHERE state='running' AND machineId IN (SELECT id FROM machines WHERE lastSeen<? OR revokedAt IS NOT NULL)",
        )
        .run(ctx.now() - 45000);
      return stale.length;
    })
    .immediate();
}

/** A live runner whose run has said nothing for this long is stuck, not slow. At least ten minutes, whatever the run's own limit. */
export const STALL_FLOOR_MS = 10 * 60 * 1000;

/**
 * Stall detection: a run that is `running` on a machine that is still heartbeating, but has reported nothing for twice
 * its time limit (and never less than ten minutes), is asked to stop. The runner aborts it on its next heartbeat; the
 * run then ends as cancelled through the usual path. A machine that went silent is the other sweep's job.
 */
export function reconcileStalled(ctx: Context): number {
  return ctx.sqlite
    .transaction(() => {
      const now = ctx.now();
      const stalled = ctx.sqlite
        .prepare(
          "SELECT r.id,r.projectId,r.agentId,r.workId,r.timeoutMs,COALESCE(r.lastSeen,r.createdAt) AS at FROM runs r JOIN machines m ON m.id=r.machineId WHERE r.state='running' AND m.lastSeen>=? AND m.revokedAt IS NULL",
        )
        .all(now - 45000) as {
        id: string;
        projectId: string;
        agentId: string;
        workId: string;
        timeoutMs: number;
        at: number;
      }[];
      let count = 0;
      for (const r of stalled) {
        const limit = Math.max(STALL_FLOOR_MS, r.timeoutMs * 2);
        if (now - r.at < limit) continue;
        ctx.sqlite.prepare("UPDATE runs SET state='cancel_requested' WHERE id=?").run(r.id);
        emit(
          ctx,
          { id: 'system', role: 'owner', projectIds: [] },
          r.projectId,
          'run.stalled',
          {
            runId: r.id,
            agentId: r.agentId,
            workId: r.workId,
            silentMs: now - r.at,
            limitMs: limit,
          },
          r.id,
          r.id,
        );
        count++;
      }
      return count;
    })
    .immediate();
}

import type { Context } from './context.js';

const DAY = 24 * 60 * 60 * 1000;
/**
 * How long each append-only table keeps its rows. A client whose event cursor predates the kept events is told to fetch
 * a snapshot (`SNAPSHOT_REQUIRED`), so pruning the log never skips events silently.
 */
export const RETENTION = {
  /** The event log and its outbox rows (nothing consumes the outbox). The newest event of every project always stays. */
  eventsMs: 90 * DAY,
  /** Idempotency receipts: a command key replayed after this is run again instead of answered from the journal. */
  commandJournalMs: 90 * DAY,
  /** Runner report ids (de-duplication), only for runs that are over. */
  runnerReportsMs: 30 * DAY,
  /** GitHub redelivers within days, so a delivery id older than this can never be a duplicate. */
  webhookDeliveriesMs: 30 * DAY,
};
/** Rows removed per table per pass, so one pass stays short; the next pass continues. */
const BATCH = 2000;
const ACTIVE_RUN = "('claimed','running','cancel_requested','indeterminate')";

/** Deletes what is past its retention (and expired browser sessions). Returns the number of rows removed. */
export function pruneRetention(ctx: Context): number {
  const now = ctx.now();
  const db = ctx.sqlite;
  return db
    .transaction(() => {
      let removed = 0;
      const old = db
        .prepare(
          `SELECT eventId FROM events WHERE occurredAt<? AND seq NOT IN (SELECT MAX(seq) FROM events GROUP BY projectId)
           ORDER BY seq LIMIT ?`,
        )
        .all(now - RETENTION.eventsMs, BATCH) as { eventId: string }[];
      if (old.length) {
        const ids = JSON.stringify(old.map((e) => e.eventId));
        const outbox = '(SELECT id FROM outbox WHERE eventId IN (SELECT value FROM json_each(?)))';
        db.prepare(`DELETE FROM outbox_deliveries WHERE outboxId IN ${outbox}`).run(ids);
        db.prepare('DELETE FROM outbox WHERE eventId IN (SELECT value FROM json_each(?))').run(ids);
        removed += db
          .prepare('DELETE FROM events WHERE eventId IN (SELECT value FROM json_each(?))')
          .run(ids).changes;
      }
      const limited = (table: string, where: string, ...args: number[]) =>
        db
          .prepare(
            `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${BATCH})`,
          )
          .run(...args).changes;
      removed += limited('command_journal', 'createdAt<?', now - RETENTION.commandJournalMs);
      removed += limited(
        'runner_reports',
        `receivedAt<? AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.id=runner_reports.runId AND r.state IN ${ACTIVE_RUN})`,
        now - RETENTION.runnerReportsMs,
      );
      removed += limited('webhook_deliveries', 'receivedAt<?', now - RETENTION.webhookDeliveriesMs);
      removed += limited('browser_sessions', 'expiresAt<=?', now);
      return removed;
    })
    .immediate();
}

import { randomUUID } from 'node:crypto';
import type { Reaped } from '@aether/providers';
import type { Journal } from './journal.js';

/**
 * After a restart a run that was not finished gets an `indeterminate` result (no automatic retry) that says whether its
 * process was left running and has been stopped.
 */
export function settleInterruptedWork(journal: Journal, survivors: ReadonlyMap<string, Reaped>) {
  for (const entry of Object.values(journal.state.jobs))
    if (entry.state === 'running') {
      entry.state = 'finished';
      entry.result = {
        jobId: entry.job.id,
        status: 'failed',
        error: 'RUNNER_RESTARTED_RESULT_UNKNOWN',
      };
      journal.save();
    }
  for (const run of Object.values(journal.state.runs)) {
    if (run.state === 'finished') continue;
    // A persisted PID is never signalled here: reapSurvivors has already judged it by pid and start time.
    const survivor = survivors.get(run.command.runId);
    journal.enqueue({
      type: 'result',
      sourceEventId: randomUUID(),
      runId: run.command.runId,
      epoch: run.command.epoch,
      outcome: 'indeterminate',
      summary: `Runner restarted during execution. ${
        survivor && survivor.action !== 'none'
          ? `Its process was left running and has been stopped (${survivor.action});`
          : 'Process ownership must be reconciled;'
      } no automatic retry.`,
    });
    run.state = 'finished';
    journal.save();
  }
}

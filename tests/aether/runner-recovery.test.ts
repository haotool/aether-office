import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { RunCommand, RunnerJob } from '../../packages/contracts/src/index.js';
import type { Reaped } from '../../packages/providers/src/index.js';
import { Journal } from '../../apps/runner/src/journal.js';
import { settleInterruptedWork } from '../../apps/runner/src/runner-recovery.js';
import { runWorkspaceJob } from '../../apps/runner/src/workspace-jobs.js';

const journal = () =>
  new Journal(join(mkdtempSync(join(tmpdir(), 'aether-recovery-')), 'journal.json'));
const command = (runId: string) => ({ runId, epoch: 3 }) as RunCommand;

it('settles a restarted runner: running jobs have an unknown result and unfinished runs end indeterminate', () => {
  const j = journal();
  j.state.jobs['job-1'] = { job: { id: 'job-1' } as RunnerJob, state: 'running' };
  j.state.jobs['job-2'] = { job: { id: 'job-2' } as RunnerJob, state: 'finished', result: 'kept' };
  j.state.runs['run-1'] = { command: command('run-1'), state: 'running', processIdentity: '1:2' };
  j.state.runs['run-2'] = { command: command('run-2'), state: 'accepted' };
  j.state.runs['run-3'] = { command: command('run-3'), state: 'finished' };
  const survivors = new Map<string, Reaped>([
    ['run-1', { identity: '1:2', verdict: 'orphaned', action: 'terminated' }],
  ]);

  settleInterruptedWork(j, survivors);

  expect(j.state.jobs['job-1']).toMatchObject({
    state: 'finished',
    result: { jobId: 'job-1', status: 'failed', error: 'RUNNER_RESTARTED_RESULT_UNKNOWN' },
  });
  expect(j.state.jobs['job-2']?.result).toBe('kept');
  expect(Object.values(j.state.runs).map((run) => run.state)).toEqual([
    'finished',
    'finished',
    'finished',
  ]);
  expect(
    j.state.pending.map((e) => ({ runId: 'runId' in e ? e.runId : null, type: e.type })),
  ).toEqual([
    { runId: 'run-1', type: 'result' },
    { runId: 'run-2', type: 'result' },
  ]);
  const summaries = j.state.pending.map((e) => ('summary' in e ? e.summary : ''));
  expect(summaries[0]).toContain('left running and has been stopped (terminated)');
  expect(summaries[1]).toContain('Process ownership must be reconciled');
});

it('reports a workspace job that cannot run as failed, with a fixed code and no detail', async () => {
  const job = { id: 'job-9' } as RunnerJob;
  expect(await runWorkspaceJob(undefined, job, new AbortController().signal)).toEqual({
    jobId: 'job-9',
    status: 'failed',
    error: 'NATIVE_EXECUTION_NOT_GRANTED',
  });
});

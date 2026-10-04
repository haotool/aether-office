import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Journal } from '../../apps/runner/src/journal.js';
import { Runner } from '../../apps/runner/src/runner.js';
import { alive, orphan, until } from './process-fixtures.js';

it('stops what a crashed runner left running, and only what the journal says was still going', async () => {
  const [run, terminal, finished] = await Promise.all([orphan(), orphan(), orphan()]);
  const journal = new Journal(
    join(mkdtempSync(join(tmpdir(), 'aether-survivors-')), 'journal.json'),
  );
  journal.state.runs['run-going'] = {
    command: { runId: 'run-going', epoch: 1 } as never,
    state: 'running',
    processIdentity: run.identity,
  };
  journal.state.runs['run-finished'] = {
    command: { runId: 'run-finished', epoch: 1 } as never,
    state: 'finished',
    processIdentity: finished.identity, // done: whatever is at that pid now is nobody's business
  };
  journal.state.terminals['term-open'] = {
    pending: false,
    snapshot: {
      terminalId: 'term-open',
      state: 'running',
      processIdentity: terminal.identity,
    } as never,
  };
  const runner = new Runner('http://127.0.0.1:9', 'unused-token', journal);
  try {
    const reaped = await runner.reapSurvivors();
    expect(reaped.map((r) => r.verdict)).toEqual(['orphaned', 'orphaned']);
    expect(await until(() => !alive(run.pid) && !alive(terminal.pid))).toBe(true);
    expect(alive(finished.pid)).toBe(true); // a finished run's process is never touched
    runner.start();
    runner.stop();
    const result = journal.state.pending.find(
      (e) => e.type === 'result' && e.runId === 'run-going',
    );
    expect(result).toMatchObject({ outcome: 'indeterminate' });
    expect((result as { summary: string }).summary).toMatch(/left running and has been stopped/);
  } finally {
    process.kill(-finished.pid, 'SIGKILL');
  }
}, 30000);

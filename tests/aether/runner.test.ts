import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runFixture } from '../../packages/providers/src/index.js';
import { Journal } from '../../apps/runner/src/journal.js';
import type { RunCommand } from '../../packages/contracts/src/index.js';
describe('real fixture subprocess and durable runner spool', () => {
  it('runs a real Node process with OS birth identity and awaits the final result', async () => {
    const events: string[] = [];
    const command: RunCommand = {
      id: randomUUID(),
      runId: randomUUID(),
      sessionId: randomUUID(),
      maxTurns: 1,
      attempt: 1,
      epoch: 1,
      projectId: randomUUID(),
      agentId: randomUUID(),
      workId: randomUUID(),
      provider: 'demo',
      mode: 'demo',
      prompt: 'Synthetic process test',
      root: null,
      timeoutMs: 3000,
    };
    const result = await runFixture(
      command,
      {
        started: async (_session, identity) => {
          expect(identity).toMatch(/^\d+:/);
          events.push('started');
        },
        activity: async (activity) => {
          events.push(activity);
        },
      },
      new AbortController().signal,
    );
    expect(events).toEqual(['started', 'working']);
    expect(result.outcome).toBe('submitted');
    expect(result.summary).toContain('No paid model ran');
    const dir = mkdtempSync(join(tmpdir(), 'aether-runner-'));
    try {
      const file = join(dir, 'journal.json');
      const journal = new Journal(file);
      expect(journal.accept(command)).toBe(true);
      expect(journal.accept(command)).toBe(false);
      const event = {
        type: 'result' as const,
        sourceEventId: randomUUID(),
        runId: command.runId,
        epoch: 1,
        ...result,
      };
      journal.enqueue(event);
      const restored = new Journal(file);
      expect(restored.state.pending).toEqual([event]);
      expect(restored.accept(command)).toBe(false);
      restored.acknowledge(event.sourceEventId);
      expect(new Journal(file).state.pending).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

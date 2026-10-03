import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command } from './fixture.js';
import { enroll, claim, report } from '../../apps/control/src/services/runners.js';
it('serializes each agent across machines and keeps cancellation/unknown work fenced', () => {
  let now = 0;
  const f = fixture(':memory:', () => ++now);
  try {
    const queue = (name: string, agentId: string) => {
      const workId = String(
        f.control.execute(
          f.owner.actor,
          command(
            'work.create',
            { title: name, description: '', acceptance: 'Schedule only' },
            f.projectId,
          ),
        ).result['id'],
      );
      f.control.execute(f.owner.actor, command('work.assign', { workId, agentId }, f.projectId, 1));
      return workId;
    };
    const first = queue('First', f.senderId);
    const second = queue('Second', f.senderId);
    const third = queue('Other agent', f.recipientId);
    const a = enroll(f.control.ctx, f.owner.actor, 'A', [f.projectId], 4),
      b = enroll(f.control.ctx, f.owner.actor, 'B', [f.projectId], 4);
    const run = claim(f.control.ctx, a.actor, ['demo'])!;
    expect(run.workId).toBe(first);
    expect(claim(f.control.ctx, b.actor, ['demo'])?.workId).toBe(third);
    expect(claim(f.control.ctx, b.actor, ['demo'])).toBeNull();
    f.control.execute(f.owner.actor, command('work.cancel', { workId: first }, f.projectId, 2));
    expect(claim(f.control.ctx, b.actor, ['demo'])).toBeNull();
    report(f.control.ctx, a.actor, {
      type: 'result',
      sourceEventId: randomUUID(),
      runId: run.runId,
      epoch: run.epoch,
      outcome: 'submitted',
      summary: 'Cancellation race',
    });
    expect(claim(f.control.ctx, b.actor, ['demo'])).toBeNull();
    // Reconciliation is deliberately not implemented here; unknown ownership must remain fenced.
    expect(
      f.control.snapshot(f.owner.actor, f.projectId).work.find((w) => w.id === second)?.state,
    ).toBe('assigned');
  } finally {
    f.control.close();
  }
});
it('ages old queued work ahead of fresh high priority work while preserving priority and deterministic ties', () => {
  let now = 0;
  const f = fixture(':memory:', () => now);
  try {
    const queue = (name: string, priority: number) => {
      const agentId = f.register(name);
      const workId = String(
        f.control.execute(
          f.owner.actor,
          command(
            'work.create',
            { title: name, description: '', acceptance: 'Fair selection', priority },
            f.projectId,
          ),
        ).result['id'],
      );
      f.control.execute(f.owner.actor, command('work.assign', { workId, agentId }, f.projectId, 1));
      return workId;
    };
    const low = queue('Old low priority', 0);
    now = 240000;
    const high = queue('New high priority', 3);
    const normal = queue('Normal', 1);
    const machine = enroll(f.control.ctx, f.owner.actor, 'Scheduler', [f.projectId], 4);
    expect(claim(f.control.ctx, machine.actor, ['demo'])?.workId).toBe(low);
    expect(claim(f.control.ctx, machine.actor, ['demo'])?.workId).toBe(high);
    expect(claim(f.control.ctx, machine.actor, ['demo'])?.workId).toBe(normal);
  } finally {
    f.control.close();
  }
});

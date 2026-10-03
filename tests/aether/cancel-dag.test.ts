import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command, seedWork } from './fixture.js';
import { enroll, claim, report } from '../../apps/control/src/services/runners.js';
it.each(['queued', 'running'] as const)(
  'cancels waiting diamond descendants once while preserving executed work (%s root)',
  (phase) => {
    const f = fixture();
    try {
      const create = (title: string, dependencies: string[] = []) =>
        String(
          f.control.execute(
            f.owner.actor,
            command(
              'work.create',
              { title, description: '', acceptance: 'Cancellation propagation', dependencies },
              f.projectId,
            ),
          ).result['id'],
        );
      const root = create('Root'),
        left = create('Left', [root]),
        right = create('Right', [root]),
        join = create('Join', [left, right]),
        unrelated = create('Unrelated'),
        historical = create('Historical attempt', [root]);
      // Reconciled/legacy execution evidence must survive even if its prerequisite graph is inconsistent.
      seedWork(
        f.control,
        historical,
        "state='failed',attempt=1,result='Preserve prior execution evidence'",
      );
      const machine = enroll(f.control.ctx, f.owner.actor, 'Cancellation fixture', [f.projectId]);
      f.control.execute(
        f.owner.actor,
        command('work.assign', { workId: root, agentId: f.senderId }, f.projectId, 1),
      );
      const run = phase === 'running' ? claim(f.control.ctx, machine.actor, ['demo']) : null;
      if (run)
        report(f.control.ctx, machine.actor, {
          type: 'started',
          sourceEventId: randomUUID(),
          runId: run.runId,
          epoch: run.epoch,
          providerSessionId: 'fixture',
          processIdentity: 'fixture-owned',
        });
      const find = (id: string) =>
        f.control.snapshot(f.owner.actor, f.projectId).work.find((w) => w.id === id)!;
      const cancel = command('work.cancel', { workId: root }, f.projectId, find(root).version);
      const receipt = f.control.execute(f.owner.actor, cancel);
      for (const id of [left, right, join])
        expect(find(id)).toMatchObject({
          state: 'cancelled',
          version: 2,
          cancelCause: root,
          attempt: 0,
        });
      expect(find(unrelated)).toMatchObject({ state: 'ready', version: 1, cancelCause: null });
      expect(find(historical)).toMatchObject({
        state: 'failed',
        attempt: 1,
        result: 'Preserve prior execution evidence',
        cancelCause: null,
      });
      expect(() =>
        f.control.execute(
          f.owner.actor,
          command('work.assign', { workId: left, agentId: f.senderId }, f.projectId, 1),
        ),
      ).toThrow('VERSION_CONFLICT');
      expect(() =>
        f.control.execute(
          f.owner.actor,
          command('work.assign', { workId: left, agentId: f.senderId }, f.projectId, 2),
        ),
      ).toThrow('INVALID_TRANSITION');
      expect(f.control.execute(f.owner.actor, cancel)).toEqual(receipt);
      expect(
        f.control
          .events(f.owner.actor, f.projectId, '0')
          .filter((e) => e.type === 'work.dependency.cancelled'),
      ).toHaveLength(3);
      if (run) {
        expect(find(root).state).toBe('cancel_requested');
        report(f.control.ctx, machine.actor, {
          type: 'result',
          sourceEventId: randomUUID(),
          runId: run.runId,
          epoch: run.epoch,
          outcome: 'submitted',
          summary: 'Late success must not revive descendants',
        });
        expect(find(root).state).toBe('indeterminate');
        for (const id of [left, right, join]) expect(find(id).state).toBe('cancelled');
      } else {
        expect(find(root).state).toBe('cancelled');
        expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeNull();
      }
    } finally {
      f.control.close();
    }
  },
);

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Control } from '../../apps/control/src/control.js';
import {
  claim,
  enroll,
  heartbeat,
  reconcileOffline,
  report,
} from '../../apps/control/src/services/runners.js';
import { command, fixture } from './fixture.js';

const SECRET = 'fixed-test-cursor-secret-32-characters';

function started(f: ReturnType<typeof fixture>, machine: ReturnType<typeof enroll>) {
  const workId = String(
    f.control.execute(
      f.owner.actor,
      command(
        'work.create',
        { title: 'Side effects', description: '', acceptance: 'x' },
        f.projectId,
      ),
    ).result['id'],
  );
  f.control.execute(
    f.owner.actor,
    command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
  );
  const run = claim(f.control.ctx, machine.actor, ['demo'])!;
  report(f.control.ctx, machine.actor, {
    type: 'started',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    providerSessionId: 'p',
    processIdentity: 'owned',
  });
  return { workId, run };
}
const state = (f: ReturnType<typeof fixture>, workId: string) =>
  (
    f.control.ctx.sqlite.prepare('SELECT state FROM work_items WHERE id=?').get(workId) as {
      state: string;
    }
  ).state;

it('after a restart a lost runner leaves the run indeterminate: no second spawn, no resurrection by a late result, and only a human closes it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-reconcile-'));
  const file = join(directory, 'control.sqlite');
  const clock = { now: 1_000_000 };
  try {
    const f = fixture(file, () => clock.now);
    const machineA = enroll(f.control.ctx, f.owner.actor, 'A', [f.projectId]);
    const machineB = enroll(f.control.ctx, f.owner.actor, 'B', [f.projectId]);
    const { workId, run } = started(f, machineA);
    expect(state(f, workId)).toBe('running');

    clock.now += 60_000; // machine A stops heartbeating; B stays alive
    heartbeat(f.control.ctx, machineB.actor);
    f.control.close();

    const reopened = new Control(file, {
      mode: 'demo',
      cursorSecret: SECRET,
      now: () => clock.now,
    });
    try {
      const view = { ...f, control: reopened } as typeof f;
      expect(reconcileOffline(reopened.ctx)).toBe(1);
      expect(state(view, workId)).toBe('indeterminate');
      expect(reconcileOffline(reopened.ctx)).toBe(0); // idempotent across repeated sweeps and restarts

      // Another machine must not pick the work up: the unknown side effects may already have happened.
      expect(claim(reopened.ctx, machineB.actor, ['demo'])).toBeNull();
      expect(
        (
          reopened.ctx.sqlite
            .prepare('SELECT COUNT(*) AS n FROM runs WHERE workId=?')
            .get(workId) as { n: number }
        ).n,
      ).toBe(1);

      // A late "success" from the partitioned runner is recorded as unknown, never as reviewable work.
      report(reopened.ctx, machineA.actor, {
        type: 'result',
        sourceEventId: randomUUID(),
        runId: run.runId,
        epoch: run.epoch,
        outcome: 'submitted',
        summary: 'late',
      });
      expect(state(view, workId)).toBe('indeterminate');

      // No automatic retry either: re-running is a human decision.
      const current = () =>
        (
          reopened.ctx.sqlite.prepare('SELECT version FROM work_items WHERE id=?').get(workId) as {
            version: number;
          }
        ).version;
      expect(() =>
        reopened.execute(
          reopened.identity(f.owner.actor.id),
          command('work.retry', { workId }, f.projectId, current()),
        ),
      ).toThrow('INVALID_TRANSITION');

      // The human closes it. The run is retired with it.
      const version = (
        reopened.ctx.sqlite.prepare('SELECT version FROM work_items WHERE id=?').get(workId) as {
          version: number;
        }
      ).version;
      reopened.execute(
        reopened.identity(f.owner.actor.id),
        command('work.cancel', { workId }, f.projectId, version),
      );
      expect(state(view, workId)).toBe('cancelled');
      expect(
        (
          reopened.ctx.sqlite.prepare('SELECT state FROM runs WHERE id=?').get(run.runId) as {
            state: string;
          }
        ).state,
      ).toBe('cancelled');
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('a snapshot and the event stream never lose or repeat an event around the snapshot cursor', () => {
  const f = fixture();
  try {
    const add = (title: string) =>
      f.control.execute(
        f.owner.actor,
        command('work.create', { title, description: '', acceptance: 'x' }, f.projectId),
      );
    add('before-1');
    add('before-2');
    const snapshot = f.control.snapshot(f.owner.actor, f.projectId);
    add('after-1');
    add('after-2');
    add('after-3');

    // Everything in the snapshot was committed at or before its cursor...
    const upTo = f.control
      .events(f.owner.actor, f.projectId, '0', 200)
      .filter((e) => BigInt(e.seq) <= BigInt(snapshot.seq));
    const created = upTo
      .filter((e) => e.type === 'work.create')
      .map((e) => String(e.payload['title']));
    expect(snapshot.work.map((w) => w.title).sort()).toEqual(created.sort());
    // ...and the stream from that cursor is exactly the later events, contiguous and in order.
    const later = f.control.events(f.owner.actor, f.projectId, snapshot.seq, 200);
    expect(later.map((e) => String(e.payload['title']))).toEqual(['after-1', 'after-2', 'after-3']);
    const seqs = later.map((e) => BigInt(e.seq));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1]!)).toBe(true);
    expect(seqs[0]! > BigInt(snapshot.seq)).toBe(true);
  } finally {
    f.control.close();
  }
});

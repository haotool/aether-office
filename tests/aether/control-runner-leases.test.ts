import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  enroll,
  claim,
  heartbeat,
  report,
  reconcileOffline,
} from '../../apps/control/src/services/runtime/runners.js';
import { command, fixture } from './fixture.js';
const close: (() => void)[] = [];
afterEach(() => {
  for (const fn of close.splice(0).reverse()) fn();
});
function setup() {
  const f = fixture();
  close.push(() => f.control.close());
  return f;
}

describe('runner leases and work', () => {
  it('retries failed work with fresh identity, bounded attempts and stale-result fencing', () => {
    const f = setup();
    const runner = enroll(f.control.ctx, f.owner.actor, 'retry runner', [f.projectId]);
    const workId = String(
      f.control.execute(
        f.owner.actor,
        command(
          'work.create',
          { title: 'Retry', description: '', acceptance: 'bounded' },
          f.projectId,
        ),
      ).result['id'],
    );
    const current = () =>
      f.control.snapshot(f.owner.actor, f.projectId).work.find((w) => w.id === workId)!;
    expect(() =>
      f.control.execute(f.owner.actor, command('work.retry', { workId }, f.projectId, 1)),
    ).toThrow('INVALID_TRANSITION');
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
    );
    const sessions = new Set<string>();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const run = claim(f.control.ctx, runner.actor, ['demo'])!;
      sessions.add(run.sessionId);
      report(f.control.ctx, runner.actor, {
        type: 'started',
        sourceEventId: randomUUID(),
        runId: run.runId,
        epoch: run.epoch,
        providerSessionId: `fixture-${attempt}`,
        processIdentity: 'owned-child',
      });
      report(f.control.ctx, runner.actor, {
        type: 'result',
        sourceEventId: randomUUID(),
        runId: run.runId,
        epoch: run.epoch,
        outcome: 'failed',
        summary: 'fixture failure',
      });
      expect(() =>
        f.control.execute(
          f.owner.actor,
          command('work.retry', { workId, resume: true }, f.projectId, current().version),
        ),
      ).toThrow('CAPABILITY_UNSUPPORTED'); // demo provider cannot resume
      expect(() =>
        f.control.execute(
          f.sender.actor,
          command('work.retry', { workId }, f.projectId, current().version),
        ),
      ).toThrow('FORBIDDEN');
      if (attempt < 3) {
        const retry = command('work.retry', { workId }, f.projectId, current().version);
        const receipt = f.control.execute(f.owner.actor, retry);
        expect(f.control.execute(f.owner.actor, retry)).toEqual(receipt);
        expect(() =>
          report(f.control.ctx, runner.actor, {
            type: 'result',
            sourceEventId: randomUUID(),
            runId: run.runId,
            epoch: run.epoch,
            outcome: 'submitted',
            summary: 'stale',
          }),
        ).toThrow('RUN_TERMINAL');
        expect(current().state).toBe('assigned');
      } else
        expect(() =>
          f.control.execute(
            f.owner.actor,
            command('work.retry', { workId }, f.projectId, current().version),
          ),
        ).toThrow('ATTEMPT_LIMIT_REQUIRES_ESCALATION');
    }
    expect(sessions.size).toBe(3);
    expect(current().attempt).toBe(3);
    expect(current().state).toBe('failed');
    const operator = f.control.createIdentity(f.owner.actor, {
      name: 'Operator',
      role: 'operator',
      projectIds: [f.projectId],
    });
    const grant = command(
      'work.extend',
      { workId, reason: 'Reviewed failures; authorize exactly one further attempt.' },
      f.projectId,
      current().version,
    );
    expect(() => f.control.execute(operator.actor, grant)).toThrow('FORBIDDEN');
    const approval = f.control.execute(f.owner.actor, grant);
    expect(f.control.execute(f.owner.actor, grant)).toEqual(approval);
    expect(current()).toMatchObject({ attempt: 3, maxAttempts: 4, state: 'failed' });
    expect(claim(f.control.ctx, runner.actor, ['demo'])).toBeNull();
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command(
          'work.extend',
          { workId, reason: 'No second unused grant' },
          f.projectId,
          current().version,
        ),
      ),
    ).toThrow('ATTEMPT_LIMIT_NOT_REACHED');
    const audit = f.control
      .events(f.owner.actor, f.projectId, '0')
      .find((e) => e.type === 'work.extend');
    expect(audit?.payload).toMatchObject({
      extensionReason: 'Reviewed failures; authorize exactly one further attempt.',
      approvedBy: f.owner.actor.id,
      maxAttempts: 4,
    });
    f.control.execute(
      operator.actor,
      command('work.retry', { workId }, f.projectId, current().version),
    );
    expect(claim(f.control.ctx, runner.actor, ['demo'])).not.toBeNull();
    expect(current().attempt).toBe(4);
  });
  it('claims once, applies duplicate source events once, and does not equate submission with completion', () => {
    const f = setup();
    const runner = enroll(f.control.ctx, f.owner.actor, 'fixture runner', [f.projectId]);
    heartbeat(f.control.ctx, runner.actor);
    const w = f.control.execute(
      f.owner.actor,
      command(
        'work.create',
        { title: 'Test', description: 'A controlled fixture', acceptance: 'review and verify' },
        f.projectId,
      ),
    );
    const workId = String(w.result['id']);
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
    );
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
      ),
    ).toThrow('VERSION_CONFLICT');
    const run = claim(f.control.ctx, runner.actor, ['demo'])!;
    expect(run.workId).toBe(workId);
    expect(claim(f.control.ctx, runner.actor, ['demo'])).toBe(null);
    const started = {
      type: 'started',
      sourceEventId: randomUUID(),
      runId: run.runId,
      epoch: run.epoch,
      providerSessionId: 'fixture-1',
      processIdentity: 'owned-child',
    };
    expect(report(f.control.ctx, runner.actor, started)).toEqual({ duplicate: false });
    expect(report(f.control.ctx, runner.actor, started)).toEqual({ duplicate: true });
    report(f.control.ctx, runner.actor, {
      type: 'result',
      sourceEventId: randomUUID(),
      runId: run.runId,
      epoch: run.epoch,
      outcome: 'submitted',
      summary: 'Fixture submitted; no live model used',
    });
    const item = f.control.snapshot(f.owner.actor, f.projectId).work[0]!;
    expect(item.state).toBe('reviewing');
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command('work.accept', { workId }, f.projectId, item.version),
      ),
    ).toThrow('INVALID_TRANSITION');
  });
  it('runner loss fences work as indeterminate rather than spawning twice', () => {
    let now = 100000;
    const f = fixture(':memory:', () => now);
    close.push(() => f.control.close());
    const runner = enroll(f.control.ctx, f.owner.actor, 'fixture runner', [f.projectId]);
    heartbeat(f.control.ctx, runner.actor);
    const w = f.control.execute(
      f.owner.actor,
      command(
        'work.create',
        { title: 'Crash window', description: '', acceptance: 'do not duplicate' },
        f.projectId,
      ),
    );
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId: w.result['id'], agentId: f.senderId }, f.projectId, 1),
    );
    expect(claim(f.control.ctx, runner.actor, ['demo'])).not.toBe(null);
    now += 45001;
    expect(reconcileOffline(f.control.ctx)).toBe(1);
    expect(claim(f.control.ctx, runner.actor, ['demo'])).toBe(null);
    expect(f.control.snapshot(f.owner.actor, f.projectId).work[0]?.state).toBe('indeterminate');
  });
});

it('retains late process and tool evidence after cancellation without reviving work', () => {
  const f = setup();
  const runner = enroll(f.control.ctx, f.owner.actor, 'late runner', [f.projectId]);
  const work = f.control.execute(
    f.owner.actor,
    command(
      'work.create',
      { title: 'Cancellation race', description: '', acceptance: 'never resurrect' },
      f.projectId,
    ),
  );
  const workId = String(work.result['id']);
  f.control.execute(
    f.owner.actor,
    command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
  );
  const run = claim(f.control.ctx, runner.actor, ['demo'])!;
  f.control.execute(f.owner.actor, command('work.cancel', { workId }, f.projectId, 2));
  report(f.control.ctx, runner.actor, {
    type: 'started',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    providerSessionId: 'late',
    processIdentity: 'owned-fixture',
  });
  report(f.control.ctx, runner.actor, {
    type: 'provider',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    event: {
      kind: 'tool.failed',
      toolId: 'late-tool',
      turnId: 'late-turn',
      name: 'fixture',
      summary: 'Cancelled',
      parentToolId: null,
    },
  });
  expect(f.control.snapshot(f.owner.actor, f.projectId).work[0]?.state).toBe('cancel_requested');
  report(f.control.ctx, runner.actor, {
    type: 'result',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    outcome: 'submitted',
    summary: 'late success cannot win',
  });
  expect(f.control.snapshot(f.owner.actor, f.projectId).work[0]?.state).toBe('indeterminate');
});

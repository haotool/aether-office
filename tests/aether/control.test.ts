import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Control } from '../../apps/control/src/control.js';
import {
  enroll,
  claim,
  heartbeat,
  report,
  reconcileOffline,
} from '../../apps/control/src/services/runners.js';
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
describe('SQLite canonical state', () => {
  it('atomically persists state, event, outbox and idempotency receipt', () => {
    const f = setup();
    const c = command(
      'message.send',
      { recipients: [f.recipientId], body: '資料持久化' },
      f.projectId,
    );
    const first = f.control.execute(f.sender.actor, c);
    const retry = f.control.execute(f.sender.actor, c);
    expect(retry).toEqual(first);
    expect(f.control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({
      n: 1,
    });
    expect(
      f.control.ctx.sqlite
        .prepare('SELECT COUNT(*) AS n FROM events WHERE causationId=?')
        .get(first.commandId),
    ).toEqual({ n: 1 });
    expect(
      f.control.ctx.sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM outbox WHERE eventId IN (SELECT eventId FROM events WHERE causationId=?)',
        )
        .get(first.commandId),
    ).toEqual({ n: 1 });
    expect(() =>
      f.control.execute(f.sender.actor, { ...c, data: { ...(c.data as object), body: 'changed' } }),
    ).toThrow('IDEMPOTENCY_CONFLICT');
    const before = f.control.highWatermark(f.projectId);
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'message.send',
          { recipients: [f.recipientId, randomUUID()], body: 'must roll back' },
          f.projectId,
        ),
      ),
    ).toThrow('AGENT_NOT_FOUND');
    expect(f.control.highWatermark(f.projectId)).toBe(before);
    expect(f.control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({
      n: 1,
    });
  });
  it('100 acknowledged messages cannot hide the 101st pending message', () => {
    const f = setup();
    for (let i = 0; i < 100; i++) {
      // Separate authenticated senders avoid defeating the real per-sender rate limit in production.
      const sender = i < 50 ? f.sender.actor : f.owner.actor;
      const sent = f.send(`訊息 ${i}`, sender);
      f.control.execute(
        f.recipient.actor,
        command(
          'message.ack',
          { messageId: sent.result['id'], recipientId: f.recipientId },
          f.projectId,
        ),
      );
    }
    f.send('第 101 則 未讀', f.owner.actor);
    const page = f.control.inbox(f.recipient.actor, f.projectId, { recipientId: f.recipientId });
    expect(page.messages.map((m) => m.body)).toEqual(['第 101 則 未讀']);
    expect(page.hasMore).toBe(false);
  });
  it('keyset paging returns 1000 unique messages and excludes new inserts until a fresh scan', () => {
    let now = 1700000000000;
    const f = fixture(':memory:', () => now);
    close.push(() => f.control.close());
    for (let i = 0; i < 1000; i++) {
      now += 1100;
      f.send(`payload ${i} 🦊`);
    }
    let page = f.control.inbox(f.recipient.actor, f.projectId, {
      recipientId: f.recipientId,
      limit: 73,
    });
    const ids = page.messages.map((m) => m.id);
    f.send('inserted after highWatermark');
    while (page.nextCursor) {
      page = f.control.inbox(f.recipient.actor, f.projectId, {
        recipientId: f.recipientId,
        limit: 73,
        cursor: page.nextCursor,
      });
      ids.push(...page.messages.map((m) => m.id));
    }
    expect(ids.length).toBe(1000);
    expect(new Set(ids).size).toBe(1000);
    const latest = f.control.inbox(f.recipient.actor, f.projectId, {
      recipientId: f.recipientId,
      limit: 100,
    });
    expect(BigInt(latest.highWatermark)).toBeGreaterThan(BigInt(page.highWatermark));
  });
  it('snapshot plus durable cursor has no subscription gap', () => {
    const f = setup();
    const snapshot = f.control.snapshot(f.owner.actor, f.projectId);
    const sent = f.send('after snapshot');
    expect(
      f.control
        .events(f.owner.actor, f.projectId, snapshot.seq)
        .some((e) => e.payload['id'] === sent.result['id']),
    ).toBe(true);
  });
  it('survives close/reopen and safe online backup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-store-'));
    close.push(() => rmSync(dir, { recursive: true, force: true }));
    const filename = join(dir, 'control.sqlite');
    const f = fixture(filename);
    f.send('restart evidence');
    await f.control.ctx.sqlite.backup(join(dir, 'backup.sqlite'));
    f.control.close();
    const reopened = new Control(filename, { mode: 'demo' });
    close.push(() => reopened.close());
    expect(
      reopened.snapshot(reopened.authenticate(f.owner.token), f.projectId).messages[0]?.body,
    ).toBe('restart evidence');
    const restored = new Control(join(dir, 'backup.sqlite'), { mode: 'demo' });
    close.push(() => restored.close());
    expect(restored.ctx.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(
      restored.snapshot(restored.authenticate(f.owner.token), f.projectId).messages.length,
    ).toBe(1);
  });
});
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

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Control } from '../../apps/control/src/control.js';
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

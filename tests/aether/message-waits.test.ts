import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, command } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';
import { refreshMessageWaits } from '../../apps/control/src/services/domain/messages.js';
import { Control } from '../../apps/control/src/control.js';
import {
  enroll,
  claim,
  sessionCredential,
} from '../../apps/control/src/services/runtime/runners.js';
it('persists per-recipient request waits with exact reply correlation, deadlines, cancellation and scoped reads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-waits-'));
  const file = join(dir, 'control.sqlite');
  let now = 10000;
  const f = fixture(file, () => now);
  let control = f.control;
  try {
    const request = command(
      'message.send',
      {
        recipients: [f.recipientId, f.owner.actor.id],
        body: 'Need both replies',
        kind: 'request',
        ttlMs: 60000,
      },
      f.projectId,
    );
    const id = String(control.execute(f.sender.actor, request).result['id']);
    expect(control.execute(f.sender.actor, request).result['id']).toBe(id);
    expect(control.messageWaits(f.sender.actor, f.projectId, id)).toHaveLength(2);
    expect(control.messageWaits(f.recipient.actor, f.projectId, id)).toHaveLength(1);
    const app = createServer(control, { origin: 'http://127.0.0.1:4488' });
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${f.projectId}/messages/${id}/waits`,
        headers: { host: '127.0.0.1:4488', authorization: `Bearer ${f.recipient.token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(1);
      expect(response.json()[0]).toMatchObject({ recipientId: f.recipientId, state: 'pending' });
    } finally {
      await app.close();
    }

    const outsider = control.createIdentity(f.owner.actor, {
      name: 'Other',
      role: 'agent',
      projectIds: [f.projectId],
      agentId: f.register('Other'),
    });
    expect(() => control.messageWaits(outsider.actor, f.projectId, id)).toThrow(
      'MESSAGE_FORBIDDEN',
    );
    control.execute(
      f.recipient.actor,
      command(
        'message.send',
        { recipients: [f.owner.actor.id], body: 'Wrong destination', kind: 'inform', replyTo: id },
        f.projectId,
      ),
    );
    expect(control.messageWaits(f.recipient.actor, f.projectId, id)[0]).toMatchObject({
      state: 'pending',
      replyId: null,
    });
    expect(
      control.inbox(f.recipient.actor, f.projectId, { recipientId: f.recipientId }).messages[0]
        ?.delivery.state,
    ).toBe('available');
    const reply = control.execute(
      f.recipient.actor,
      command(
        'message.send',
        { recipients: [f.senderId], body: 'Answer', kind: 'inform', replyTo: id },
        f.projectId,
      ),
    );
    expect(control.messageWaits(f.recipient.actor, f.projectId, id)[0]).toMatchObject({
      state: 'responded',
      replyId: reply.result['id'],
    });
    control.close();
    control = new Control(file, { mode: 'live', now: () => now });
    now += 60000;
    const restored = control.messageWaits(f.sender.actor, f.projectId, id);
    expect(restored).toContainEqual(
      expect.objectContaining({ recipientId: f.owner.actor.id, state: 'expired', endedAt: now }),
    );
    expect(restored).toContainEqual(
      expect.objectContaining({
        recipientId: f.recipientId,
        state: 'responded',
        replyId: reply.result['id'],
      }),
    );
    const workId = String(
      control.execute(
        f.owner.actor,
        command(
          'work.create',
          { title: 'Waiting work', description: '', acceptance: 'Cancel waiting' },
          f.projectId,
        ),
      ).result['id'],
    );
    const liveAgent = String(
      control.execute(
        f.owner.actor,
        command(
          'agent.register',
          {
            name: 'Synthetic native',
            provider: 'codex',
            role: 'Engineer',
            species: 'fox',
            color: '#abcdef',
          },
          f.projectId,
        ),
      ).result['id'],
    );
    control.execute(
      f.owner.actor,
      command(
        'project.execution.configure',
        { liveEnabled: true, maxTurns: 1, timeoutMs: 30000 },
        f.projectId,
        0,
      ),
    );
    control.execute(
      f.owner.actor,
      command('work.assign', { workId, agentId: liveAgent }, f.projectId, 1),
    );
    const machine = enroll(control.ctx, f.owner.actor, 'Wait fixture', [f.projectId]);
    const run = claim(control.ctx, machine.actor, ['codex'])!;
    const credentials = sessionCredential(control.ctx, machine.actor, run.runId, run.epoch);
    const actor = control.authenticate(credentials.token);
    const bound = String(
      control.execute(
        actor,
        command(
          'message.send',
          { recipients: [f.recipientId], body: 'Work question', kind: 'request' },
          f.projectId,
        ),
      ).result['id'],
    );
    const version = control
      .snapshot(f.owner.actor, f.projectId)
      .work.find((w) => w.id === workId)!.version;
    control.execute(f.owner.actor, command('work.cancel', { workId }, f.projectId, version));
    expect(
      control.ctx.sqlite
        .prepare('SELECT state,workId,runId FROM message_waits WHERE messageId=?')
        .get(bound),
    ).toEqual({ state: 'cancelled', workId, runId: run.runId });
    control.execute(
      f.recipient.actor,
      command(
        'message.send',
        { recipients: [liveAgent], body: 'Late answer', kind: 'inform', replyTo: bound },
        f.projectId,
      ),
    );
    expect(control.messageWaits(f.owner.actor, f.projectId, bound)[0]).toMatchObject({
      state: 'cancelled',
      replyId: null,
    });
  } finally {
    control.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('sweeps expiry without a reader and commits each transition with its event exactly once', async () => {
  let now = 1000;
  const f = fixture(':memory:', () => now);
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4488' });
  const id = String(
    f.control.execute(
      f.sender.actor,
      command(
        'message.send',
        { recipients: [f.recipientId], body: 'Deadline fixture', kind: 'request', ttlMs: 1000 },
        f.projectId,
      ),
    ).result['id'],
  );
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    await app.ready();
    now = 2000;
    f.control.ctx.sqlite.exec(
      "CREATE TRIGGER fail_wait_event BEFORE INSERT ON events WHEN NEW.type='message.wait.expired' BEGIN SELECT RAISE(ABORT,'INJECTED_EVENT_FAILURE'); END;",
    );
    expect(() => refreshMessageWaits(f.control.ctx)).toThrow('INJECTED_EVENT_FAILURE');
    expect(
      f.control.ctx.sqlite.prepare('SELECT state FROM message_waits WHERE messageId=?').get(id),
    ).toEqual({ state: 'pending' });
    f.control.ctx.sqlite.exec('DROP TRIGGER fail_wait_event');
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      f.control.ctx.sqlite
        .prepare('SELECT state,endedAt FROM message_waits WHERE messageId=?')
        .get(id),
    ).toEqual({ state: 'expired', endedAt: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(refreshMessageWaits(f.control.ctx)).toBe(0);
    expect(
      f.control
        .events(f.owner.actor, f.projectId, '0')
        .filter((e) => e.type === 'message.wait.expired'),
    ).toHaveLength(1);
    await app.close();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await app.close();
    vi.useRealTimers();
    f.control.close();
  }
});

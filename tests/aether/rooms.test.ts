import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture } from './fixture.js';

const room = (f: ReturnType<typeof fixture>, name: string, members: string[]) =>
  f.control.execute(f.owner.actor, command('room.create', { name, members }, f.projectId))
    .result as { id: string; members: string[] };

it('delivers a room post to every other member with its own delivery record, and enforces membership', () => {
  const f = fixture();
  try {
    const third = String(
      f.control.execute(
        f.owner.actor,
        command(
          'agent.register',
          { name: 'Third', role: 'Engineer', provider: 'demo', species: 'cat', color: '#aabbcc' },
          f.projectId,
        ),
      ).result['id'],
    );
    const thirdCredential = f.control.createIdentity(f.owner.actor, {
      name: 'Third credential',
      role: 'agent',
      projectIds: [f.projectId],
      agentId: third,
    });
    const team = room(f, 'Engineering', [f.senderId, f.recipientId]);

    const sent = f.control.execute(
      f.sender.actor,
      command('message.send', { roomId: team.id, body: 'standup', kind: 'inform' }, f.projectId),
    );
    expect(sent.result['roomId']).toBe(team.id);
    const rows = f.control.ctx.sqlite
      .prepare('SELECT recipientId,state FROM recipient_deliveries WHERE messageId=?')
      .all(String(sent.result['id']));
    expect(rows).toEqual([{ recipientId: f.recipientId, state: 'available' }]); // not the sender, not the non-member

    // One member acknowledging does not mark anyone else's delivery.
    const bigRoom = room(f, 'Everyone', [f.senderId, f.recipientId, third]);
    const broadcast = f.control.execute(
      f.sender.actor,
      command(
        'message.send',
        { roomId: bigRoom.id, body: 'all hands', kind: 'inform' },
        f.projectId,
      ),
    );
    f.control.execute(
      f.recipient.actor,
      command(
        'message.ack',
        { messageId: String(broadcast.result['id']), recipientId: f.recipientId },
        f.projectId,
      ),
    );
    const states = Object.fromEntries(
      (
        f.control.ctx.sqlite
          .prepare('SELECT recipientId,state FROM recipient_deliveries WHERE messageId=?')
          .all(String(broadcast.result['id'])) as { recipientId: string; state: string }[]
      ).map((r) => [r.recipientId, r.state]),
    );
    expect(states).toEqual({ [f.recipientId]: 'acknowledged', [third]: 'available' });

    // A non-member agent cannot post, and sees nothing of the room.
    expect(() =>
      f.control.execute(
        thirdCredential.actor,
        command('message.send', { roomId: team.id, body: 'sneak', kind: 'inform' }, f.projectId),
      ),
    ).toThrow('ROOM_FORBIDDEN');
    // A human owner may post without being a member.
    expect(
      f.control.execute(
        f.owner.actor,
        command(
          'message.send',
          { roomId: team.id, body: 'from the owner', kind: 'decision' },
          f.projectId,
        ),
      ).result['roomId'],
    ).toBe(team.id);

    // Rooms and explicit recipients are mutually exclusive; unknown rooms and foreign members are refused.
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'message.send',
          { roomId: team.id, recipients: [f.recipientId], body: 'x' },
          f.projectId,
        ),
      ),
    ).toThrow();
    expect(() =>
      f.control.execute(f.sender.actor, command('message.send', { body: 'nobody' }, f.projectId)),
    ).toThrow();
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'message.send',
          { roomId: '00000000-0000-4000-8000-000000000000', body: 'x' },
          f.projectId,
        ),
      ),
    ).toThrow('ROOM_NOT_FOUND');
    expect(() => room(f, 'Bad', ['00000000-0000-4000-8000-000000000000'])).toThrow(
      'MEMBER_NOT_IN_PROJECT',
    );
    expect(() => room(f, 'Engineering', [f.senderId])).toThrow('ROOM_NAME_TAKEN');
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('room.create', { name: 'Mine', members: [f.senderId] }, f.projectId),
      ),
    ).toThrow('FORBIDDEN'); // agents cannot create rooms
  } finally {
    f.control.close();
  }
});

it('membership changes take effect immediately, and agents only list their own rooms over HTTP', async () => {
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4498' });
  try {
    const team = room(f, 'Pair', [f.senderId, f.recipientId]);
    f.control.execute(
      f.owner.actor,
      command('room.members', { roomId: team.id, members: [f.senderId] }, f.projectId),
    );
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('message.send', { roomId: team.id, body: 'alone' }, f.projectId),
      ),
    ).toThrow('ROOM_HAS_NO_OTHER_MEMBERS');
    expect(() =>
      f.control.execute(
        f.recipient.actor,
        command('message.send', { roomId: team.id, body: 'removed' }, f.projectId),
      ),
    ).toThrow('ROOM_FORBIDDEN');

    const list = async (token: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${f.projectId}/rooms`,
          headers: { authorization: `Bearer ${token}`, host: '127.0.0.1:4498' },
        })
      ).json().rooms as { name: string }[];
    expect((await list(f.owner.token)).map((r) => r.name)).toEqual(['Pair']);
    expect((await list(f.sender.token)).map((r) => r.name)).toEqual(['Pair']); // still a member
    expect(await list(f.recipient.token)).toEqual([]); // removed: the room is no longer visible
  } finally {
    await app.close();
    f.control.close();
  }
});

it('stops an agent ping-pong at the thread round limit and the per-sender rate limit; a human can start a fresh thread', () => {
  let now = 1_000_000;
  const f = fixture(':memory:', () => now);
  try {
    let thread: string | undefined;
    const post = (who: typeof f.sender, to: string) =>
      f.control.execute(
        who.actor,
        command(
          'message.send',
          {
            recipients: [to],
            body: 'ping',
            kind: 'inform',
            ...(thread ? { threadId: thread } : {}),
          },
          f.projectId,
        ),
      );
    thread = String(post(f.sender, f.recipientId).result['threadId']);
    for (let i = 1; i < 32; i++) {
      now += 2_000; // stay under the per-minute rate limit while still looping
      post(i % 2 ? f.recipient : f.sender, i % 2 ? f.senderId : f.recipientId);
    }
    expect(() => post(f.sender, f.recipientId)).toThrow('THREAD_ROUND_LIMIT'); // the 33rd message in one thread
    const fresh = f.control.execute(
      f.owner.actor,
      command(
        'message.send',
        {
          recipients: [f.senderId, f.recipientId],
          body: 'Stop and wait for me.',
          kind: 'decision',
        },
        f.projectId,
      ),
    );
    expect(fresh.result['threadId']).not.toBe(thread); // a human escalation opens a new thread with its own budget

    now += 120_000;
    let blocked = 0;
    for (let i = 0; i < 70; i++)
      try {
        f.control.execute(
          f.sender.actor,
          command('message.send', { recipients: [f.recipientId], body: `burst ${i}` }, f.projectId),
        );
      } catch (error) {
        if ((error as Error).message === 'MESSAGE_RATE_LIMIT') blocked++;
      }
    expect(blocked).toBeGreaterThan(0);
  } finally {
    f.control.close();
  }
});

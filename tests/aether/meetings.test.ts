import { expect, it } from 'vitest';
import { command, fixture } from './fixture.js';

const setup = (clock: { now: number }) => {
  const f = fixture(':memory:', () => clock.now);
  const start = (data: Record<string, unknown> = {}) =>
    f.control.execute(
      f.owner.actor,
      command(
        'meeting.start',
        {
          topic: 'Pick a queue',
          question: 'Redis or SQS?',
          participants: [f.senderId, f.recipientId],
          maxRounds: 4,
          deadlineMinutes: 30,
          ...data,
        },
        f.projectId,
      ),
    ).result as { threadId: string; roomId: string };
  const say = (who: typeof f.sender, threadId: string, to: string) =>
    f.control.execute(
      who.actor,
      command(
        'message.send',
        { recipients: [to], body: 'my view', kind: 'inform', threadId },
        f.projectId,
      ),
    );
  return { f, start, say };
};

it('bounds a meeting by rounds, then records one decision whose provenance is the meeting itself', () => {
  const clock = { now: 1_000_000 };
  const { f, start, say } = setup(clock);
  try {
    const meeting = start();
    say(f.sender, meeting.threadId, f.recipientId);
    say(f.recipient, meeting.threadId, f.senderId);
    say(f.sender, meeting.threadId, f.recipientId);
    expect(() => say(f.recipient, meeting.threadId, f.senderId)).toThrow('MEETING_ROUND_LIMIT');

    f.control.execute(
      f.owner.actor,
      command(
        'message.send',
        {
          recipients: [f.senderId, f.recipientId],
          threadId: meeting.threadId,
          body: 'Thanks, deciding now.',
          kind: 'inform',
        },
        f.projectId,
      ),
    );
    const concluded = f.control.execute(
      f.owner.actor,
      command(
        'meeting.conclude',
        { threadId: meeting.threadId, decision: 'Use SQS.' },
        f.projectId,
      ),
    ).result as { knowledgeId: string; messages: number };
    expect(concluded.messages).toBe(5);
    const entry = f.control.ctx.sqlite
      .prepare('SELECT title,body,source,classification FROM knowledge WHERE id=?')
      .get(concluded.knowledgeId) as {
      title: string;
      body: string;
      source: string;
      classification: string;
    };
    expect(entry).toMatchObject({
      title: 'Meeting decision: Pick a queue',
      source: `meeting:${meeting.threadId}`,
      classification: 'proposed',
    });
    expect(entry.body).toContain('Use SQS.');
    expect(entry.body).toContain(`thread ${meeting.threadId}`);
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command('meeting.conclude', { threadId: meeting.threadId, decision: 'again' }, f.projectId),
      ),
    ).toThrow('MEETING_ALREADY_CONCLUDED');
    expect(() => say(f.sender, meeting.threadId, f.recipientId)).toThrow('MEETING_CLOSED');
  } finally {
    f.control.close();
  }
});

it('closes at the deadline even with rounds to spare, and only humans can run meetings', () => {
  const clock = { now: 1_000_000 };
  const { f, start, say } = setup(clock);
  try {
    const meeting = start({ maxRounds: 12, deadlineMinutes: 5 });
    say(f.sender, meeting.threadId, f.recipientId);
    clock.now += 6 * 60_000;
    expect(() => say(f.recipient, meeting.threadId, f.senderId)).toThrow('MEETING_CLOSED');

    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'meeting.start',
          { topic: 'x', question: 'y', participants: [f.senderId, f.recipientId] },
          f.projectId,
        ),
      ),
    ).toThrow('FORBIDDEN');
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('meeting.conclude', { threadId: meeting.threadId, decision: 'x' }, f.projectId),
      ),
    ).toThrow('FORBIDDEN');
    expect(() => start({ participants: [f.senderId] })).toThrow();
    expect(() => start({ maxRounds: 99 })).toThrow();
  } finally {
    f.control.close();
  }
});

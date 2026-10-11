import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { DomainError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';
import { sendMessage } from './messages.js';
import { roomCommand } from './rooms.js';

type Start = Extract<Command, { type: 'meeting.start' }>;
type Conclude = Extract<Command, { type: 'meeting.conclude' }>;
type MeetingRow = {
  threadId: string;
  roomId: string;
  topic: string;
  maxRounds: number;
  deadlineAt: number;
  concludedAt: number | null;
};

export function startMeeting(ctx: Context, actor: Actor, c: Start) {
  const room = roomCommand(ctx, actor, {
    ...c,
    type: 'room.create',
    data: {
      name: `Meeting ${randomUUID().slice(0, 8)}: ${c.data.topic}`.slice(0, 160),
      members: c.data.participants,
    },
  } as Extract<Command, { type: 'room.create' }>) as { id: string };
  const deadlineAt = ctx.now() + c.data.deadlineMinutes * 60_000;
  const opening = sendMessage(ctx, actor, {
    ...c,
    type: 'message.send',
    data: {
      roomId: room.id,
      recipients: [],
      body: c.data.question,
      kind: 'request',
      ttlMs: c.data.deadlineMinutes * 60_000,
    },
  } as Extract<Command, { type: 'message.send' }>) as { id: string; threadId: string };
  ctx.sqlite
    .prepare(
      'INSERT INTO meetings(threadId,projectId,roomId,topic,maxRounds,deadlineAt,createdBy) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      opening.threadId,
      c.projectId,
      room.id,
      c.data.topic,
      c.data.maxRounds,
      deadlineAt,
      actor.id,
    );
  return { threadId: opening.threadId, roomId: room.id, maxRounds: c.data.maxRounds, deadlineAt };
}

export function concludeMeeting(ctx: Context, actor: Actor, c: Conclude) {
  const meeting = ctx.sqlite
    .prepare('SELECT * FROM meetings WHERE threadId=? AND projectId=?')
    .get(c.data.threadId, c.projectId) as MeetingRow | undefined;
  if (!meeting) throw new DomainError('MEETING_NOT_FOUND', 404);
  if (meeting.concludedAt) throw new DomainError('MEETING_ALREADY_CONCLUDED', 409);
  const messages = ctx.sqlite
    .prepare('SELECT id,senderId FROM messages WHERE threadId=? ORDER BY createdAt,id')
    .all(c.data.threadId) as { id: string; senderId: string }[];
  const knowledgeId = randomUUID();
  const now = ctx.now();
  ctx.sqlite
    .prepare(
      "INSERT INTO knowledge(id,projectId,title,body,source,author,classification,version,createdAt,updatedAt) VALUES (?,?,?,?,?,?,'proposed',1,?,?)",
    )
    .run(
      knowledgeId,
      c.projectId,
      `Meeting decision: ${meeting.topic}`.slice(0, 160),
      `${c.data.decision}\n\nProvenance: thread ${c.data.threadId}; messages ${messages.map((m) => m.id).join(', ')}; participants ${[...new Set(messages.map((m) => m.senderId))].join(', ')}.`,
      `meeting:${c.data.threadId}`,
      actor.id,
      now,
      now,
    );
  ctx.sqlite
    .prepare('UPDATE meetings SET concludedAt=?,knowledgeId=? WHERE threadId=?')
    .run(now, knowledgeId, c.data.threadId);
  return { threadId: c.data.threadId, knowledgeId, messages: messages.length };
}

export function listMeetings(ctx: Context, projectId: string) {
  return ctx.sqlite
    .prepare(
      'SELECT m.threadId,m.topic,m.maxRounds,m.deadlineAt,m.concludedAt,(SELECT COUNT(*) FROM messages x WHERE x.threadId=m.threadId) AS rounds FROM meetings m WHERE m.projectId=? ORDER BY m.deadlineAt DESC',
    )
    .all(projectId) as {
    threadId: string;
    topic: string;
    maxRounds: number;
    deadlineAt: number;
    concludedAt: number | null;
    rounds: number;
  }[];
}

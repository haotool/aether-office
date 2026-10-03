import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import {
  inboxQuerySchema,
  messageWaitSchema,
  messageSchema,
  deliverySchema,
  type Command,
  type InboxPage,
} from '@aether/contracts';
import { assertOwnedAgent, authorize, DomainError, type Actor } from '@aether/kernel';
import { messages } from '../db/schema.js';
import { identityActor } from './identity.js';
import { agent, project, emit, type Context } from './context.js';
import { roomRecipients } from './rooms.js';

function participant(ctx: Context, projectId: string, id: string, persist = true): void {
  let kind: 'agent' | 'user' = 'agent';
  if (!ctx.sqlite.prepare('SELECT 1 FROM agents WHERE id=? AND projectId=?').get(id, projectId)) {
    const person = identityActor(ctx, id);
    authorize(person, 'read', projectId);
    if (!['owner', 'operator', 'reviewer', 'viewer'].includes(person.role))
      throw new DomainError('RECIPIENT_FORBIDDEN', 403);
    kind = 'user';
  }
  if (persist)
    ctx.sqlite
      .prepare('INSERT OR IGNORE INTO participants VALUES (?,?,?)')
      .run(id, projectId, kind);
}

type Send = Extract<Command, { type: 'message.send' }>;
export function sendMessage(ctx: Context, actor: Actor, command: Send) {
  const { projectId, data: input } = command;
  const senderId = actor.agentId ?? actor.id;
  // A room post is delivered to the room's other members, each with its own delivery record.
  const data = input.roomId
    ? { ...input, recipients: roomRecipients(ctx, projectId, input.roomId, actor) }
    : input;
  if (new Set(data.recipients).size !== data.recipients.length)
    throw new DomainError('DUPLICATE_RECIPIENT', 400);
  for (const recipient of data.recipients) {
    try {
      participant(ctx, projectId, recipient);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'AUTH_REQUIRED')
        throw new DomainError('AGENT_NOT_FOUND', 404);
      throw error;
    }
  }
  participant(ctx, projectId, senderId);
  if (actor.agentId) agent(ctx, projectId, actor.agentId);
  let threadId = data.threadId ?? randomUUID();
  if (data.replyTo) {
    const original = getMessage(ctx, actor, projectId, data.replyTo);
    if (original.expiresAt <= ctx.now()) throw new DomainError('MESSAGE_EXPIRED');
    if (data.threadId && data.threadId !== original.threadId)
      throw new DomainError('THREAD_MISMATCH', 400);
    threadId = original.threadId;
  } else if (data.threadId) {
    const first = ctx.db
      .select()
      .from(messages)
      .where(and(eq(messages.projectId, projectId), eq(messages.threadId, threadId)))
      .get();
    if (!first) throw new DomainError('THREAD_NOT_FOUND', 404);
    getMessage(ctx, actor, projectId, first.id);
  }
  const rounds = ctx.sqlite
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE projectId=? AND threadId=?')
    .get(projectId, threadId) as { n: number };
  if (rounds.n >= 32) throw new DomainError('THREAD_ROUND_LIMIT');
  const rate = ctx.sqlite
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE senderId=? AND createdAt>?')
    .get(senderId, ctx.now() - 60000) as { n: number };
  if (rate.n >= 60) throw new DomainError('MESSAGE_RATE_LIMIT', 429);
  const message = {
    id: randomUUID(),
    projectId,
    threadId,
    replyTo: data.replyTo ?? null,
    senderId,
    body: data.body,
    kind: data.kind,
    createdAt: ctx.now(),
    expiresAt: ctx.now() + data.ttlMs,
    roomId: data.roomId ?? null,
  };
  ctx.db.insert(messages).values(message).run();
  for (const recipientId of data.recipients)
    ctx.sqlite
      .prepare(
        'INSERT INTO recipient_deliveries(messageId,projectId,recipientId,state) VALUES (?,?,?,?)',
      )
      .run(message.id, projectId, recipientId, 'available');
  if (data.kind === 'request')
    for (const recipientId of data.recipients)
      ctx.sqlite
        .prepare(
          'INSERT INTO message_waits(messageId,recipientId,projectId,workId,runId,deadline) VALUES (?,?,?,?,?,?)',
        )
        .run(
          message.id,
          recipientId,
          projectId,
          actor.workId ?? null,
          actor.runId ?? null,
          message.expiresAt,
        );
  if (data.replyTo) {
    refreshMessageWaits(ctx, projectId);
    const resolved = ctx.sqlite
      .prepare(
        "UPDATE message_waits SET state='responded',replyId=?,endedAt=? WHERE messageId=? AND recipientId=? AND state='pending' AND EXISTS (SELECT 1 FROM messages m WHERE m.id=message_waits.messageId AND m.senderId IN (SELECT value FROM json_each(?))) RETURNING *",
      )
      .all(message.id, ctx.now(), data.replyTo, senderId, JSON.stringify(data.recipients));
    for (const row of resolved)
      emit(
        ctx,
        actor,
        projectId,
        'message.wait.responded',
        messageWaitSchema.parse(row),
        command.idempotencyKey,
        command.correlationId,
        ctx.mode === 'demo' ? 'simulated' : 'command',
      );
  }
  if (data.replyTo)
    ctx.sqlite
      .prepare(
        "UPDATE recipient_deliveries SET state='responded',acknowledgedAt=COALESCE(acknowledgedAt,?) WHERE messageId=? AND recipientId=? AND state IN ('available','injected','acknowledged') AND EXISTS (SELECT 1 FROM messages m WHERE m.id=recipient_deliveries.messageId AND m.senderId IN (SELECT value FROM json_each(?)))",
      )
      .run(ctx.now(), data.replyTo, senderId, JSON.stringify(data.recipients));
  return message;
}
export function getMessage(ctx: Context, actor: Actor, projectId: string, messageId: string) {
  project(ctx, actor, projectId);
  const message = ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.projectId, projectId)))
    .get();
  if (!message) throw new DomainError('MESSAGE_NOT_FOUND', 404);
  if (actor.role === 'agent' && message.senderId !== actor.agentId) {
    const delivery = ctx.sqlite
      .prepare(
        'SELECT 1 FROM recipient_deliveries WHERE projectId=? AND messageId=? AND recipientId=?',
      )
      .get(projectId, messageId, actor.agentId);
    if (!delivery) throw new DomainError('MESSAGE_FORBIDDEN', 403);
  }
  return messageSchema.parse(message);
}
export function acknowledge(
  ctx: Context,
  actor: Actor,
  command: Extract<Command, { type: 'message.ack' }>,
) {
  assertOwnedAgent(actor, command.data.recipientId);
  if (actor.role !== 'agent' && command.data.recipientId !== actor.id)
    throw new DomainError('RECIPIENT_FORBIDDEN', 403);
  const original = getMessage(ctx, actor, command.projectId, command.data.messageId);
  if (original.expiresAt <= ctx.now()) throw new DomainError('MESSAGE_EXPIRED');
  const row = ctx.sqlite
    .prepare(
      'SELECT state FROM recipient_deliveries WHERE messageId=? AND recipientId=? AND projectId=?',
    )
    .get(command.data.messageId, command.data.recipientId, command.projectId) as
    { state: string } | undefined;
  if (!row) throw new DomainError('DELIVERY_NOT_FOUND', 404);
  if (!['available', 'injected', 'acknowledged', 'responded'].includes(row.state))
    throw new DomainError('DELIVERY_TERMINAL');
  ctx.sqlite
    .prepare(
      "UPDATE recipient_deliveries SET state='acknowledged',acknowledgedAt=? WHERE messageId=? AND recipientId=? AND state IN ('available','injected')",
    )
    .run(ctx.now(), command.data.messageId, command.data.recipientId);
  return {
    messageId: command.data.messageId,
    recipientId: command.data.recipientId,
    acknowledgedBy: actor.id,
  };
}
function signature(ctx: Context, payload: string): string {
  return createHmac('sha256', ctx.cursorSecret).update(payload).digest('base64url');
}
export function inbox(ctx: Context, actor: Actor, projectId: string, input: unknown): InboxPage {
  project(ctx, actor, projectId);
  const query = inboxQuerySchema.parse(input);
  assertOwnedAgent(actor, query.recipientId);
  if (
    actor.role !== 'agent' &&
    query.recipientId !== actor.id &&
    !['owner', 'operator'].includes(actor.role)
  )
    throw new DomainError('RECIPIENT_FORBIDDEN', 403);
  participant(ctx, projectId, query.recipientId, false);
  let after = '0';
  let high = (
    ctx.sqlite
      .prepare(
        'SELECT CAST(COALESCE(MAX(sequence),0) AS TEXT) AS value FROM recipient_deliveries WHERE projectId=? AND recipientId=?',
      )
      .get(projectId, query.recipientId) as { value: string }
  ).value;
  if (query.cursor) {
    const [payload, sig, ...extra] = query.cursor.split('.');
    if (!payload || !sig || extra.length) throw new DomainError('INVALID_CURSOR', 400);
    const expected = Buffer.from(signature(ctx, payload));
    const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got))
      throw new DomainError('INVALID_CURSOR', 400);
    let cursor: unknown;
    try {
      cursor = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new DomainError('INVALID_CURSOR', 400);
    }
    if (!cursor || typeof cursor !== 'object') throw new DomainError('INVALID_CURSOR', 400);
    const c = cursor as Record<string, unknown>;
    if (
      c['v'] !== 1 ||
      c['p'] !== projectId ||
      c['r'] !== query.recipientId ||
      c['f'] !== query.filter ||
      typeof c['a'] !== 'string' ||
      !/^\d+$/.test(c['a']) ||
      typeof c['h'] !== 'string' ||
      !/^\d+$/.test(c['h'])
    )
      throw new DomainError('CURSOR_SCOPE_MISMATCH', 400);
    after = c['a'];
    high = c['h'];
  }
  const rows = ctx.sqlite
    .prepare(
      `SELECT m.*,CAST(d.sequence AS TEXT) AS sequence,d.recipientId,CASE WHEN m.expiresAt<=? AND d.state IN ('available','injected') THEN 'expired' ELSE d.state END AS state,d.acknowledgedAt FROM recipient_deliveries d JOIN messages m ON m.id=d.messageId WHERE d.projectId=? AND d.recipientId=? AND d.sequence>CAST(? AS INTEGER) AND d.sequence<=CAST(? AS INTEGER) ${query.filter === 'pending' ? "AND d.state IN ('available','injected') AND m.expiresAt>?" : ''} ORDER BY d.sequence LIMIT ?`,
    )
    .all(
      ctx.now(),
      projectId,
      query.recipientId,
      after,
      high,
      ...(query.filter === 'pending' ? [ctx.now()] : []),
      query.limit + 1,
    ) as Record<string, unknown>[];
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map((row) => ({
    ...messageSchema.parse(row),
    delivery: deliverySchema.parse({ ...row, messageId: row['id'] }),
  }));
  const last = items.at(-1)?.delivery.sequence;
  const payload = Buffer.from(
    JSON.stringify({ v: 1, p: projectId, r: query.recipientId, f: query.filter, a: last, h: high }),
  ).toString('base64url');
  return {
    schemaVersion: 1,
    messages: items,
    nextCursor: hasMore && last ? `${payload}.${signature(ctx, payload)}` : null,
    hasMore,
    highWatermark: high,
  };
}

// The persisted deadline survives restarts; a bounded sweep also runs without an open browser.
export function refreshMessageWaits(ctx: Context, projectId?: string) {
  return ctx.sqlite
    .transaction(() => {
      const rows = ctx.sqlite
        .prepare(
          `UPDATE message_waits SET
      state=CASE WHEN deadline<=@now THEN 'expired' ELSE 'cancelled' END,
      endedAt=CASE WHEN deadline<=@now THEN deadline ELSE @now END
      WHERE rowid IN (SELECT w.rowid FROM message_waits w WHERE w.state='pending' AND (@project IS NULL OR w.projectId=@project) AND (
        w.deadline<=@now OR
        EXISTS (SELECT 1 FROM work_items t WHERE t.id=w.workId AND t.state IN ('cancel_requested','cancelled')) OR
        EXISTS (SELECT 1 FROM runs r WHERE r.id=w.runId AND r.state IN ('cancel_requested','cancelled','failed','submitted','indeterminate'))
      ) ORDER BY w.deadline,w.rowid LIMIT @limit) RETURNING *`,
        )
        .all({ now: ctx.now(), project: projectId ?? null, limit: projectId ? -1 : 200 });
      for (const row of rows) {
        const wait = messageWaitSchema.parse(row);
        emit(
          ctx,
          { id: 'system', role: 'owner', projectIds: [] },
          wait.projectId,
          `message.wait.${wait.state}`,
          wait,
          wait.messageId,
          wait.runId ?? wait.messageId,
          ctx.mode === 'demo' ? 'simulated' : 'command',
        );
      }
      return rows.length;
    })
    .immediate();
}
export function messageWaits(ctx: Context, actor: Actor, projectId: string, messageId: string) {
  getMessage(ctx, actor, projectId, messageId);
  return ctx.sqlite
    .transaction(() => {
      refreshMessageWaits(ctx, projectId);
      return ctx.sqlite
        .prepare(
          `SELECT w.* FROM message_waits w JOIN messages m ON m.id=w.messageId WHERE w.projectId=? AND w.messageId=? ${actor.role === 'agent' ? 'AND (m.senderId=? OR w.recipientId=?)' : ''} ORDER BY w.recipientId`,
        )
        .all(
          projectId,
          messageId,
          ...(actor.role === 'agent' ? [actor.agentId, actor.agentId] : []),
        )
        .map((row) => messageWaitSchema.parse(row));
    })
    .immediate();
}

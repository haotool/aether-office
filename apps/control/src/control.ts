import { randomUUID } from 'node:crypto';
import {
  commandSchema,
  projectSchema,
  eventSchema,
  type OfficeEvent,
  type Snapshot,
} from '@aether/contracts';
import { authorize, DomainError, type Actor } from '@aether/kernel';
import { connect } from './db/connection.js';
import { selectAll, selectIn } from './db/query.js';
import { projects } from './db/schema.js';
import { hash, secret, authenticate, createIdentity, identityActor } from './services/identity.js';
import { emit, project, type Context } from './services/context.js';
import { runCommand } from './services/command-handlers.js';
import { createPermissionRequests } from './services/permission-requests.js';
import { buildSnapshot, highWatermark } from './services/snapshot.js';
import { getMessage, inbox, messageWaits } from './services/messages.js';

/** Result fields that are bearer secrets, by command. They are shown to the caller once and nowhere else. */
const SECRET_RESULT_FIELDS: Partial<Record<string, readonly string[]>> = {
  'machine.invite': ['token'],
  'a2a.client.create': ['token'],
};
function redactSecrets(type: string, result: Record<string, unknown>): Record<string, unknown> {
  const fields = SECRET_RESULT_FIELDS[type];
  return fields
    ? { ...result, ...Object.fromEntries(fields.map((f) => [f, '[shown once]'])) }
    : result;
}

type Receipt = {
  schemaVersion: 1;
  commandId: string;
  status: 'persisted';
  result: Record<string, unknown>;
};

/** A review session may only talk back: it never changes work, files or settings. */
function assertReviewSessionMayRun(actor: Actor, type: string) {
  if (
    actor.runPurpose === 'review' &&
    !['message.send', 'message.ack', 'knowledge.propose'].includes(type)
  )
    throw new DomainError('REVIEW_SESSION_READ_ONLY', 403);
}

/** The stored receipt of an earlier call with this idempotency key, or a conflict if its request differed. */
function journaledReceipt(
  ctx: Context,
  actor: Actor,
  idempotencyKey: string,
  requestHash: string,
): Receipt | undefined {
  const old = ctx.sqlite
    .prepare(
      'SELECT requestHash,result FROM command_journal WHERE identityId=? AND idempotencyKey=?',
    )
    .get(actor.id, idempotencyKey) as { requestHash: string; result: string } | undefined;
  if (!old) return undefined;
  if (old.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT');
  return JSON.parse(old.result) as Receipt;
}

export class Control {
  readonly ctx: Context;
  /** Permission prompts waiting for a person (Remote approvals); in memory, bounded. */
  readonly permissionRequests = createPermissionRequests(() => this.ctx.now());
  constructor(
    filename: string,
    options: { mode: 'demo' | 'live'; cursorSecret?: string; now?: () => number },
  ) {
    const now = options.now ?? Date.now;
    this.ctx = {
      ...connect(filename, now),
      now,
      mode: options.mode,
      cursorSecret: options.cursorSecret ?? secret(),
    };
  }
  close(): void {
    this.ctx.sqlite.close();
  }
  authenticate(token: string): Actor {
    return authenticate(this.ctx, token);
  }
  identity(id: string): Actor {
    return identityActor(this.ctx, id);
  }
  createIdentity(
    ...args: Parameters<typeof createIdentity> extends [Context, ...infer R] ? R : never
  ) {
    return createIdentity(this.ctx, ...args);
  }
  execute(actor: Actor, input: unknown): Receipt {
    // Revocation is checked for each call, including in-process clients.
    actor = this.identity(actor.id);
    const c = commandSchema.parse(input);
    assertReviewSessionMayRun(actor, c.type);
    const projectId = 'projectId' in c ? c.projectId : undefined;
    authorize(actor, c.type, projectId);
    const requestHash = hash(JSON.stringify(c));
    return this.ctx.sqlite
      .transaction((): Receipt => {
        if (projectId) project(this.ctx, actor, projectId);
        const replay = journaledReceipt(this.ctx, actor, c.idempotencyKey, requestHash);
        if (replay) return replay;
        const commandId = randomUUID();
        const result = runCommand(this.ctx, actor, c);
        const eventProject = c.type === 'project.create' ? String(result['id']) : projectId;
        if (!eventProject) throw new DomainError('EVENT_SCOPE_REQUIRED', 500);
        // A bearer secret returned to the caller is never stored: not in the event log, not in the journal.
        const persisted = redactSecrets(c.type, result);
        emit(
          this.ctx,
          actor,
          eventProject,
          c.type,
          persisted,
          commandId,
          c.correlationId,
          this.ctx.mode === 'demo' ? 'simulated' : 'command',
        );
        const receipt = {
          schemaVersion: 1 as const,
          commandId,
          status: 'persisted' as const,
          result,
        };
        this.ctx.sqlite
          .prepare('INSERT INTO command_journal VALUES (?,?,?,?,?,?)')
          .run(
            commandId,
            actor.id,
            c.idempotencyKey,
            requestHash,
            JSON.stringify({ ...receipt, result: persisted }),
            this.ctx.now(),
          );
        return receipt;
      })
      .immediate();
  }
  listProjects(actor: Actor) {
    actor = this.identity(actor.id);
    authorize(actor, 'read');
    return (
      actor.projectIds.includes('*')
        ? selectAll(this.ctx.sqlite, projects)
        : selectIn(this.ctx.sqlite, projects, 'id', actor.projectIds)
    ).map((p) => projectSchema.parse(p));
  }
  snapshot(actor: Actor, projectId: string): Snapshot {
    return buildSnapshot(this.ctx, this.identity(actor.id), projectId);
  }
  highWatermark(projectId: string): string {
    return highWatermark(this.ctx, projectId);
  }
  events(actor: Actor, projectId: string, after: string, limit = 200): OfficeEvent[] {
    actor = this.identity(actor.id);
    project(this.ctx, actor, projectId);
    // Detailed event payloads can contain private messages. Agents use their scoped inbox instead.
    if (actor.role === 'agent' || actor.role === 'runner')
      throw new DomainError('EVENT_STREAM_FORBIDDEN', 403);
    if (!/^\d{1,19}$/.test(after) || BigInt(after) > 9223372036854775807n)
      throw new DomainError('INVALID_CURSOR', 400);
    const min = this.ctx.sqlite
      .prepare('SELECT CAST(COALESCE(MIN(seq),0) AS TEXT) AS seq FROM events WHERE projectId=?')
      .get(projectId) as { seq: string };
    if (after !== '0' && BigInt(after) < BigInt(min.seq) - 1n)
      throw new DomainError('SNAPSHOT_REQUIRED', 410);
    return (
      this.ctx.sqlite
        .prepare(
          'SELECT *,CAST(seq AS TEXT) AS seq FROM events WHERE projectId=? AND seq>CAST(? AS INTEGER) ORDER BY seq LIMIT ?',
        )
        .all(projectId, after, Math.min(200, Math.max(1, limit))) as Record<string, unknown>[]
    ).map((e) => eventSchema.parse({ ...e, payload: JSON.parse(String(e['payload'])) }));
  }
  inbox(actor: Actor, projectId: string, query: unknown) {
    return inbox(this.ctx, this.identity(actor.id), projectId, query);
  }
  messageWaits(actor: Actor, projectId: string, messageId: string) {
    return messageWaits(this.ctx, this.identity(actor.id), projectId, messageId);
  }
  message(actor: Actor, projectId: string, messageId: string) {
    return getMessage(this.ctx, this.identity(actor.id), projectId, messageId);
  }
}

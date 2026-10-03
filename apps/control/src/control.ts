import { requestReview } from './services/review-runs.js';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { eq, inArray } from 'drizzle-orm';
import {
  commandSchema,
  agentSchema,
  workSchema,
  projectSchema,
  messageSchema,
  deliverySchema,
  eventSchema,
  layoutSchema,
  type OfficeEvent,
  type Snapshot,
  type Mode,
} from '@aether/contracts';
import { authorize, assertVersion, DomainError, type Actor } from '@aether/kernel';
import { validateLayout } from '@aether/kernel';
import { connect } from './db/connection.js';
import { projects, agents, work, dependencies, messages, knowledge } from './db/schema.js';
import { hash, secret, authenticate, createIdentity, identityActor } from './services/identity.js';
import { agent, emit, project, type Context } from './services/context.js';
import { requestIntegration, requestJob } from './services/jobs.js';
import { decideApproval } from './services/approvals.js';
import { addReviewComment } from './services/review-comments.js';
import { reservationCommand } from './services/reservations.js';
import { terminalCommand } from './services/terminals.js';
import { changeWork, createWork } from './services/work.js';
import { acknowledge, getMessage, inbox, sendMessage, messageWaits } from './services/messages.js';

export class Control {
  readonly ctx: Context;
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
  execute(actor: Actor, input: unknown) {
    // Revocation is checked for each call, including in-process clients.
    actor = this.identity(actor.id);
    const c = commandSchema.parse(input);
    if (
      actor.runPurpose === 'review' &&
      !['message.send', 'message.ack', 'knowledge.propose'].includes(c.type)
    )
      throw new DomainError('REVIEW_SESSION_READ_ONLY', 403);
    const projectId = 'projectId' in c ? c.projectId : undefined;
    authorize(actor, c.type, projectId);
    const requestHash = hash(JSON.stringify(c));
    return this.ctx.sqlite
      .transaction(() => {
        if (projectId) project(this.ctx, actor, projectId);
        const old = this.ctx.sqlite
          .prepare(
            'SELECT requestHash,result FROM command_journal WHERE identityId=? AND idempotencyKey=?',
          )
          .get(actor.id, c.idempotencyKey) as { requestHash: string; result: string } | undefined;
        if (old) {
          if (old.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT');
          return JSON.parse(old.result) as {
            schemaVersion: 1;
            commandId: string;
            status: 'persisted';
            result: Record<string, unknown>;
          };
        }
        const commandId = randomUUID();
        let result: Record<string, unknown>;
        let eventProject = projectId;
        let eventType = c.type;
        switch (c.type) {
          case 'terminal.start':
          case 'terminal.takeover':
          case 'terminal.release':
          case 'terminal.input':
          case 'terminal.resize':
          case 'terminal.stop':
            result = terminalCommand(this.ctx, actor, c);
            break;
          case 'work.integrate':
            result = requestIntegration(this.ctx, actor, c);
            break;
          case 'work.comment':
            result = addReviewComment(this.ctx, actor, c);
            break;
          case 'reservation.acquire':
          case 'reservation.renew':
          case 'reservation.release':
            result = reservationCommand(this.ctx, actor, c);
            break;
          case 'project.create': {
            const row = {
              id: randomUUID(),
              name: c.data.name,
              root: c.data.root ? realpathSync(c.data.root) : null,
              mode: this.ctx.mode,
              version: 1,
              createdAt: this.ctx.now(),
            };
            this.ctx.db.insert(projects).values(row).run();
            result = row;
            eventProject = row.id;
            break;
          }
          case 'project.execution.configure': {
            if (this.ctx.mode !== 'live') throw new DomainError('LIVE_MODE_REQUIRED', 400);
            const previous = this.ctx.sqlite
              .prepare('SELECT version FROM project_policies WHERE projectId=?')
              .get(c.projectId) as { version: number } | undefined;
            assertVersion(previous?.version ?? 0, c.expectedVersion);
            this.ctx.sqlite
              .prepare(
                'INSERT INTO project_policies(projectId,liveEnabled,maxTurns,timeoutMs,version) VALUES (?,?,?,?,?) ON CONFLICT(projectId) DO UPDATE SET liveEnabled=excluded.liveEnabled,maxTurns=excluded.maxTurns,timeoutMs=excluded.timeoutMs,version=excluded.version',
              )
              .run(
                c.projectId,
                Number(c.data.liveEnabled),
                c.data.maxTurns,
                c.data.timeoutMs,
                c.expectedVersion + 1,
              );
            if (!c.data.liveEnabled) {
              this.ctx.sqlite
                .prepare(
                  "UPDATE work_items SET state='cancelled',version=version+1,updatedAt=? WHERE id IN (SELECT workId FROM runs WHERE projectId=? AND mode='live' AND purpose='implementation' AND state='queued')",
                )
                .run(this.ctx.now(), c.projectId);
              this.ctx.sqlite
                .prepare(
                  "UPDATE runner_commands SET state='cancelled' WHERE runId IN (SELECT id FROM runs WHERE projectId=? AND mode='live' AND state='queued')",
                )
                .run(c.projectId);
              this.ctx.sqlite
                .prepare(
                  "UPDATE runs SET state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'cancel_requested' END WHERE projectId=? AND mode='live' AND state IN ('queued','claimed','running')",
                )
                .run(c.projectId);
            }
            result = { ...c.data, version: c.expectedVersion + 1 };
            break;
          }
          case 'agent.register': {
            if (c.data.provider === 'demo' && this.ctx.mode !== 'demo')
              throw new DomainError('DEMO_MODE_REQUIRED', 400);
            if (c.data.provider !== 'demo' && this.ctx.mode === 'demo')
              throw new DomainError('LIVE_MODE_REQUIRED', 400);
            const mode: Mode = c.data.provider === 'observe' ? 'observe' : this.ctx.mode;
            const row = {
              ...c.data,
              id: randomUUID(),
              projectId: c.projectId,
              mode,
              activity: mode === 'observe' ? ('unknown' as const) : ('idle' as const),
              version: 1,
              createdAt: this.ctx.now(),
              lastSeen: null,
            };
            this.ctx.db.insert(agents).values(row).run();
            result = row;
            break;
          }
          case 'work.verify':
          case 'workspace.diff':
            result = requestJob(this.ctx, actor, c);
            break;
          case 'work.request_review':
            result = requestReview(this.ctx, actor, c);
            break;
          case 'work.create':
            result = createWork(this.ctx, actor, c);
            break;
          case 'work.dependencies':
          case 'work.extend':
          case 'work.retry':
          case 'work.assign':
          case 'work.submit':
          case 'work.review':
          case 'work.accept':
          case 'work.cancel':
            result = changeWork(this.ctx, actor, c);
            break;
          case 'message.send':
            result = sendMessage(this.ctx, actor, c);
            break;
          case 'message.ack':
            result = acknowledge(this.ctx, actor, c);
            break;
          case 'layout.save': {
            validateLayout(c.data.objects);
            for (const object of c.data.objects)
              if (object.agentId) agent(this.ctx, c.projectId, object.agentId);
            const row = this.ctx.sqlite
              .prepare('SELECT version FROM layouts WHERE projectId=?')
              .get(c.projectId) as { version: number } | undefined;
            assertVersion(row?.version ?? 0, c.expectedVersion);
            this.ctx.sqlite
              .prepare(
                'INSERT INTO layouts VALUES (?,?,?,?) ON CONFLICT(projectId) DO UPDATE SET version=excluded.version,data=excluded.data,updatedAt=excluded.updatedAt',
              )
              .run(c.projectId, c.expectedVersion + 1, JSON.stringify(c.data), this.ctx.now());
            result = { version: c.expectedVersion + 1, data: c.data };
            break;
          }
          case 'approval.decide':
            result = decideApproval(this.ctx, actor, c.projectId, c.expectedVersion, c.data);
            break;
          case 'knowledge.approve': {
            const row = this.ctx.db
              .select()
              .from(knowledge)
              .where(eq(knowledge.id, c.data.knowledgeId))
              .get();
            if (!row || row.projectId !== c.projectId)
              throw new DomainError('KNOWLEDGE_NOT_FOUND', 404);
            assertVersion(row.version, c.expectedVersion);
            if (row.classification !== 'proposed')
              throw new DomainError('KNOWLEDGE_ALREADY_REVIEWED');
            const patch = {
              classification: c.data.decision === 'approve' ? 'human_approved' : 'rejected',
              reviewedBy: actor.id,
              reviewReason: c.data.reason,
              updatedAt: this.ctx.now(),
              version: row.version + 1,
            };
            this.ctx.db.update(knowledge).set(patch).where(eq(knowledge.id, row.id)).run();
            result = { ...row, ...patch };
            break;
          }
          case 'knowledge.propose': {
            if (
              c.data.workId &&
              !this.ctx.sqlite
                .prepare('SELECT 1 FROM work_items WHERE id=? AND projectId=?')
                .get(c.data.workId, c.projectId)
            )
              throw new DomainError('KNOWLEDGE_WORK_NOT_FOUND', 404);
            if (
              c.data.artifactId &&
              !this.ctx.sqlite
                .prepare('SELECT 1 FROM artifacts WHERE id=? AND projectId=?')
                .get(c.data.artifactId, c.projectId)
            )
              throw new DomainError('KNOWLEDGE_ARTIFACT_NOT_FOUND', 404);
            const row = {
              id: randomUUID(),
              projectId: c.projectId,
              ...c.data,
              workId: c.data.workId ?? null,
              artifactId: c.data.artifactId ?? null,
              commitSha: c.data.commitSha ?? null,
              author: actor.id,
              classification: 'proposed',
              version: 1,
              createdAt: this.ctx.now(),
              updatedAt: this.ctx.now(),
              reviewedBy: null,
              reviewReason: null,
            };
            this.ctx.db.insert(knowledge).values(row).run();
            result = row;
            break;
          }
        }
        if (!eventProject) throw new DomainError('EVENT_SCOPE_REQUIRED', 500);
        emit(
          this.ctx,
          actor,
          eventProject,
          eventType,
          result,
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
            JSON.stringify(receipt),
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
        ? this.ctx.db.select().from(projects).all()
        : this.ctx.db
            .select()
            .from(projects)
            .where(inArray(projects.id, [...actor.projectIds]))
            .all()
    ).map((p) => projectSchema.parse(p));
  }
  snapshot(actor: Actor, projectId: string): Snapshot {
    actor = this.identity(actor.id);
    return this.ctx.sqlite
      .transaction(() => {
        const p = project(this.ctx, actor, projectId);
        const seq = this.highWatermark(projectId);
        const visible = this.ctx.db
          .select()
          .from(messages)
          .where(eq(messages.projectId, projectId))
          .all()
          .filter(
            (m) =>
              actor.role !== 'agent' ||
              m.senderId === actor.agentId ||
              !!this.ctx.sqlite
                .prepare('SELECT 1 FROM recipient_deliveries WHERE messageId=? AND recipientId=?')
                .get(m.id, actor.agentId),
          );
        const rows = visible.slice(-100).map((m) => ({
          ...messageSchema.parse(m),
          deliveries: (
            this.ctx.sqlite
              .prepare(
                'SELECT CAST(sequence AS TEXT) AS sequence,messageId,recipientId,state,acknowledgedAt FROM recipient_deliveries WHERE messageId=?',
              )
              .all(m.id) as unknown[]
          ).map((d) => deliverySchema.parse(d)),
        }));
        const layout = this.ctx.sqlite
          .prepare('SELECT version,data FROM layouts WHERE projectId=?')
          .get(projectId) as { version: number; data: string } | undefined;
        return {
          schemaVersion: 1 as const,
          seq,
          project: p,
          agents: this.ctx.db
            .select()
            .from(agents)
            .where(eq(agents.projectId, projectId))
            .all()
            .map((a) => agentSchema.parse(a)),
          work: this.ctx.db
            .select()
            .from(work)
            .where(eq(work.projectId, projectId))
            .all()
            .map((w) => workSchema.parse(w)),
          dependencies: this.ctx.db
            .select()
            .from(dependencies)
            .where(eq(dependencies.projectId, projectId))
            .all(),
          messages: rows,
          layout: layout
            ? { version: layout.version, data: layoutSchema.parse(JSON.parse(layout.data)) }
            : null,
          runner: (
            this.ctx.sqlite
              .prepare(
                'SELECT id,name,lastSeen,state,projectIds FROM machines WHERE revokedAt IS NULL',
              )
              .all() as {
              id: string;
              name: string;
              lastSeen: number;
              state: string;
              projectIds: string;
            }[]
          )
            .filter((m) => (JSON.parse(m.projectIds) as string[]).includes(projectId))
            .map((m) => ({
              id: m.id,
              name: m.name,
              lastSeen: m.lastSeen,
              state: this.ctx.now() - m.lastSeen > 15000 ? 'offline' : m.state,
            })),
        };
      })
      .deferred();
  }
  highWatermark(projectId: string): string {
    return (
      this.ctx.sqlite
        .prepare('SELECT CAST(COALESCE(MAX(seq),0) AS TEXT) AS seq FROM events WHERE projectId=?')
        .get(projectId) as { seq: string }
    ).seq;
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

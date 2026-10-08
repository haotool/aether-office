import {
  agentSchema,
  deliverySchema,
  layoutSchema,
  messageSchema,
  workSchema,
  type Snapshot,
} from '@aether/contracts';
import type { Actor } from '@aether/kernel';
import { selectAll } from '../../db/query.js';
import { agents, dependencies, messages, work } from '../../db/schema.js';
import { project, type Context } from './context.js';

/** The newest event sequence of a project, as text (sequences are 64-bit). */
export function highWatermark(ctx: Context, projectId: string): string {
  return (
    ctx.sqlite
      .prepare('SELECT CAST(COALESCE(MAX(seq),0) AS TEXT) AS seq FROM events WHERE projectId=?')
      .get(projectId) as { seq: string }
  ).seq;
}

/** The last 100 messages the actor can read (an agent: its own and those delivered to it), with their deliveries. */
function recentMessages(ctx: Context, actor: Actor, projectId: string) {
  const visible = selectAll(ctx.sqlite, messages, { projectId }).filter(
    (m) =>
      actor.role !== 'agent' ||
      m.senderId === actor.agentId ||
      !!ctx.sqlite
        .prepare('SELECT 1 FROM recipient_deliveries WHERE messageId=? AND recipientId=?')
        .get(m.id, actor.agentId),
  );
  return visible.slice(-100).map((m) => ({
    ...messageSchema.parse(m),
    deliveries: (
      ctx.sqlite
        .prepare(
          'SELECT CAST(sequence AS TEXT) AS sequence,messageId,recipientId,state,acknowledgedAt FROM recipient_deliveries WHERE messageId=?',
        )
        .all(m.id) as unknown[]
    ).map((d) => deliverySchema.parse(d)),
  }));
}

/** The machines granted this project; one not heard from for 15 seconds is offline. */
function runnersOf(ctx: Context, projectId: string) {
  return (
    ctx.sqlite
      .prepare('SELECT id,name,lastSeen,state,projectIds FROM machines WHERE revokedAt IS NULL')
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
      state: ctx.now() - m.lastSeen > 15000 ? 'offline' : m.state,
    }));
}

/** The project as one actor may see it now: agents, work, the last messages it can read, the layout and the runners. */
export function buildSnapshot(ctx: Context, actor: Actor, projectId: string): Snapshot {
  return ctx.sqlite
    .transaction(() => {
      const p = project(ctx, actor, projectId);
      const seq = highWatermark(ctx, projectId);
      const rows = recentMessages(ctx, actor, projectId);
      const layout = ctx.sqlite
        .prepare('SELECT version,data FROM layouts WHERE projectId=?')
        .get(projectId) as { version: number; data: string } | undefined;
      return {
        schemaVersion: 1 as const,
        seq,
        project: p,
        agents: selectAll(ctx.sqlite, agents, { projectId }).map((a) => agentSchema.parse(a)),
        work: selectAll(ctx.sqlite, work, { projectId }).map((w) => workSchema.parse(w)),
        dependencies: selectAll(ctx.sqlite, dependencies, { projectId }),
        messages: rows,
        layout: layout
          ? { version: layout.version, data: layoutSchema.parse(JSON.parse(layout.data)) }
          : null,
        runner: runnersOf(ctx, projectId),
      };
    })
    .deferred();
}

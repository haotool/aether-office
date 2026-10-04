import { randomUUID } from 'node:crypto';
import { projectSchema, agentSchema, workSchema, type OfficeEvent } from '@aether/contracts';
import { authorize, DomainError, type Actor } from '@aether/kernel';
import { selectOne } from '../db/query.js';
import { projects, agents, work } from '../db/schema.js';
import type { Connection } from '../db/connection.js';
export type Context = Connection & {
  now: () => number;
  mode: 'demo' | 'live';
  cursorSecret: string;
};
export function project(ctx: Context, actor: Actor, projectId: string) {
  authorize(actor, 'read', projectId);
  const row = selectOne(ctx.sqlite, projects, { id: projectId });
  if (!row) throw new DomainError('PROJECT_NOT_FOUND', 404);
  return projectSchema.parse(row);
}
export function agent(ctx: Context, projectId: string, agentId: string) {
  const row = selectOne(ctx.sqlite, agents, { projectId, id: agentId });
  if (!row) throw new DomainError('AGENT_NOT_FOUND', 404);
  return agentSchema.parse(row);
}
export function task(ctx: Context, projectId: string, workId: string) {
  const row = selectOne(ctx.sqlite, work, { projectId, id: workId });
  if (!row) throw new DomainError('WORK_NOT_FOUND', 404);
  return workSchema.parse(row);
}
export function emit(
  ctx: Context,
  actor: Actor,
  projectId: string,
  type: string,
  payload: Record<string, unknown>,
  causationId: string,
  correlationId: string,
  source: OfficeEvent['source'] = 'command',
): string {
  const eventId = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO events(eventId,projectId,type,actorId,occurredAt,ingestedAt,correlationId,causationId,source,payload) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      eventId,
      projectId,
      type,
      actor.id,
      ctx.now(),
      ctx.now(),
      correlationId,
      causationId,
      source,
      JSON.stringify(payload),
    );
  ctx.sqlite
    .prepare('INSERT INTO outbox(id,eventId,projectId,availableAt) VALUES (?,?,?,?)')
    .run(randomUUID(), eventId, projectId, ctx.now());
  return eventId;
}

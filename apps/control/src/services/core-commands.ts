import { randomUUID } from 'node:crypto';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import type { Command, Mode } from '@aether/contracts';
import { assertVersion, DomainError, validateLayout, type Actor } from '@aether/kernel';
import { insertRow, selectOne, updateRows } from '../db/query.js';
import { agents, knowledge, projects } from '../db/schema.js';
import { agent, type Context } from './context.js';

/** The commands that touch one table or one policy row directly: no service of their own. */
type Of<T extends Command['type']> = Extract<Command, { type: T }>;

/** The real path of a project's authorized folder, or a 400 that says what is wrong with it. */
function projectRoot(path: string): string {
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    throw new DomainError('PROJECT_ROOT_NOT_FOUND', 400);
  }
  try {
    if (!statSync(real).isDirectory()) throw new Error('not a directory');
    accessSync(real, constants.R_OK | constants.X_OK);
  } catch {
    throw new DomainError('PROJECT_ROOT_INVALID', 400);
  }
  return real;
}

export function createProject(ctx: Context, c: Of<'project.create'>) {
  const row = {
    id: randomUUID(),
    name: c.data.name,
    root: c.data.root ? projectRoot(c.data.root) : null,
    mode: ctx.mode,
    version: 1,
    createdAt: ctx.now(),
  };
  insertRow(ctx.sqlite, projects, row);
  return row;
}

/** Turning live execution off cancels what is queued and asks what is running to stop. */
function cancelLiveRuns(ctx: Context, projectId: string) {
  ctx.sqlite
    .prepare(
      "UPDATE work_items SET state='cancelled',version=version+1,updatedAt=? WHERE id IN (SELECT workId FROM runs WHERE projectId=? AND mode='live' AND purpose='implementation' AND state='queued')",
    )
    .run(ctx.now(), projectId);
  ctx.sqlite
    .prepare(
      "UPDATE runner_commands SET state='cancelled' WHERE runId IN (SELECT id FROM runs WHERE projectId=? AND mode='live' AND state='queued')",
    )
    .run(projectId);
  ctx.sqlite
    .prepare(
      "UPDATE runs SET state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'cancel_requested' END WHERE projectId=? AND mode='live' AND state IN ('queued','claimed','running')",
    )
    .run(projectId);
}

export function configureExecution(ctx: Context, c: Of<'project.execution.configure'>) {
  if (ctx.mode !== 'live') throw new DomainError('LIVE_MODE_REQUIRED', 400);
  const previous = ctx.sqlite
    .prepare('SELECT version FROM project_policies WHERE projectId=?')
    .get(c.projectId) as { version: number } | undefined;
  assertVersion(previous?.version ?? 0, c.expectedVersion);
  ctx.sqlite
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
  if (!c.data.liveEnabled) cancelLiveRuns(ctx, c.projectId);
  return { ...c.data, version: c.expectedVersion + 1 };
}

export function registerAgent(ctx: Context, c: Of<'agent.register'>) {
  if (c.data.provider === 'demo' && ctx.mode !== 'demo')
    throw new DomainError('DEMO_MODE_REQUIRED', 400);
  if (c.data.provider !== 'demo' && ctx.mode === 'demo')
    throw new DomainError('LIVE_MODE_REQUIRED', 400);
  const mode: Mode = c.data.provider === 'observe' ? 'observe' : ctx.mode;
  const row = {
    ...c.data,
    id: randomUUID(),
    projectId: c.projectId,
    mode,
    activity: mode === 'observe' ? ('unknown' as const) : ('idle' as const),
    version: 1,
    createdAt: ctx.now(),
    lastSeen: null,
  };
  insertRow(ctx.sqlite, agents, row);
  return row;
}

export function saveLayout(ctx: Context, c: Of<'layout.save'>) {
  validateLayout(c.data.objects);
  // A session AETHER only observes sits at a desk too (`local:` members are not registered agents).
  for (const object of c.data.objects)
    if (object.agentId && !object.agentId.startsWith('local:'))
      agent(ctx, c.projectId, object.agentId);
  const row = ctx.sqlite
    .prepare('SELECT version FROM layouts WHERE projectId=?')
    .get(c.projectId) as { version: number } | undefined;
  assertVersion(row?.version ?? 0, c.expectedVersion);
  ctx.sqlite
    .prepare(
      'INSERT INTO layouts VALUES (?,?,?,?) ON CONFLICT(projectId) DO UPDATE SET version=excluded.version,data=excluded.data,updatedAt=excluded.updatedAt',
    )
    .run(c.projectId, c.expectedVersion + 1, JSON.stringify(c.data), ctx.now());
  return { version: c.expectedVersion + 1, data: c.data };
}

export function approveKnowledge(ctx: Context, actor: Actor, c: Of<'knowledge.approve'>) {
  const row = selectOne(ctx.sqlite, knowledge, { id: c.data.knowledgeId });
  if (!row || row.projectId !== c.projectId) throw new DomainError('KNOWLEDGE_NOT_FOUND', 404);
  assertVersion(row.version, c.expectedVersion);
  if (row.classification !== 'proposed') throw new DomainError('KNOWLEDGE_ALREADY_REVIEWED');
  const patch = {
    classification: c.data.decision === 'approve' ? 'human_approved' : 'rejected',
    reviewedBy: actor.id,
    reviewReason: c.data.reason,
    updatedAt: ctx.now(),
    version: row.version + 1,
  };
  updateRows(ctx.sqlite, knowledge, { id: row.id }, patch);
  return { ...row, ...patch };
}

export function proposeKnowledge(ctx: Context, actor: Actor, c: Of<'knowledge.propose'>) {
  const exists = (table: 'work_items' | 'artifacts', id: string) =>
    ctx.sqlite.prepare(`SELECT 1 FROM ${table} WHERE id=? AND projectId=?`).get(id, c.projectId);
  if (c.data.workId && !exists('work_items', c.data.workId))
    throw new DomainError('KNOWLEDGE_WORK_NOT_FOUND', 404);
  if (c.data.artifactId && !exists('artifacts', c.data.artifactId))
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
    createdAt: ctx.now(),
    updatedAt: ctx.now(),
    reviewedBy: null,
    reviewReason: null,
  };
  insertRow(ctx.sqlite, knowledge, row);
  return row;
}

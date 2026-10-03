import { randomUUID, createHash } from 'node:crypto';
import { observationReportSchema } from '@aether/contracts';
import { authorize, DomainError, type Actor } from '@aether/kernel';
import { identityActor } from './identity.js';
import { project, agent, emit, type Context } from './context.js';
import { redact } from './approvals.js';
export function reportObservation(ctx: Context, actor: Actor, input: unknown) {
  actor = identityActor(ctx, actor.id);
  const data = observationReportSchema.parse(input);
  authorize(actor, 'runner.report', data.projectId);
  const machine = ctx.sqlite
    .prepare('SELECT projectIds FROM machines WHERE id=? AND revokedAt IS NULL')
    .get(actor.machineId) as { projectIds: string } | undefined;
  if (!machine || !(JSON.parse(machine.projectIds) as string[]).includes(data.projectId))
    throw new DomainError('MACHINE_SCOPE_FORBIDDEN', 403);
  if (project(ctx, actor, data.projectId).root !== data.projectRoot)
    throw new DomainError('OBSERVATION_PROJECT_ROOT_MISMATCH', 403);
  const observed = agent(ctx, data.projectId, data.agentId);
  if (observed.mode !== 'observe' || observed.provider !== 'observe')
    throw new DomainError('OBSERVE_AGENT_REQUIRED', 403);
  const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return ctx.sqlite
    .transaction(() => {
      const previous = ctx.sqlite
        .prepare(
          'SELECT r.requestHash,s.machineId FROM observation_reports r JOIN observation_sources s ON s.id=r.sourceId WHERE r.id=?',
        )
        .get(data.reportId) as { requestHash: string; machineId: string } | undefined;
      if (previous) {
        if (previous.requestHash !== requestHash || previous.machineId !== actor.machineId)
          throw new DomainError('OBSERVATION_REPORT_CONFLICT');
        return { duplicate: true };
      }
      const source = ctx.sqlite
        .prepare(
          'SELECT id,revision,provider FROM observation_sources WHERE projectId=? AND agentId=? AND machineId=? AND sourceKey=?',
        )
        .get(data.projectId, data.agentId, actor.machineId, data.sourceKey) as
        { id: string; revision: number; provider: string } | undefined;
      if (data.revision !== (source?.revision ?? 0) + 1)
        throw new DomainError('OBSERVATION_REVISION_MISMATCH');
      if (source && source.provider !== data.provider)
        throw new DomainError('OBSERVATION_PROVIDER_CHANGED');
      const sourceId = source?.id ?? randomUUID(),
        now = ctx.now();
      ctx.sqlite
        .prepare(
          'INSERT INTO observation_sources(id,projectId,agentId,machineId,sourceKey,provider,label,state,revision,lastSeen) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(projectId,agentId,machineId,sourceKey) DO UPDATE SET label=excluded.label,state=excluded.state,revision=excluded.revision,lastSeen=excluded.lastSeen',
        )
        .run(
          sourceId,
          data.projectId,
          data.agentId,
          actor.machineId,
          data.sourceKey,
          data.provider,
          String(redact(data.label)),
          data.status,
          data.revision,
          now,
        );
      let added = 0;
      for (const record of data.records) {
        const text = String(redact(record.text));
        const existing = ctx.sqlite
          .prepare(
            'SELECT sessionId,kind,role,text FROM observation_records WHERE sourceId=? AND sourceEventId=?',
          )
          .get(sourceId, record.sourceId) as
          { sessionId: string; kind: string; role: string; text: string } | undefined;
        if (
          existing &&
          (existing.sessionId !== record.sessionId ||
            existing.kind !== record.kind ||
            existing.role !== record.role ||
            existing.text !== text)
        )
          throw new DomainError('OBSERVATION_EVENT_CONFLICT');
        const result = ctx.sqlite
          .prepare(
            'INSERT OR IGNORE INTO observation_records(sourceId,sourceEventId,sessionId,kind,role,text,createdAt) VALUES (?,?,?,?,?,?,?)',
          )
          .run(sourceId, record.sourceId, record.sessionId, record.kind, record.role, text, now);
        if (result.changes) {
          added++;
          emit(
            ctx,
            actor,
            data.projectId,
            `observation.${record.kind}`,
            {
              sourceId,
              agentId: data.agentId,
              provider: data.provider,
              sessionId: record.sessionId,
              role: record.role,
              text,
            },
            record.sourceId,
            data.reportId,
            'observed',
          );
        }
      }
      if (added) {
        ctx.sqlite
          .prepare('UPDATE observation_sources SET lastActivity=? WHERE id=?')
          .run(now, sourceId);
        ctx.sqlite
          .prepare("UPDATE agents SET activity='unknown',lastSeen=?,version=version+1 WHERE id=?")
          .run(now, data.agentId);
      }
      ctx.sqlite
        .prepare('INSERT INTO observation_reports VALUES (?,?,?,?)')
        .run(data.reportId, sourceId, requestHash, now);
      return { duplicate: false, added, sourceId, revision: data.revision };
    })
    .immediate();
}
export function listObservations(ctx: Context, actor: Actor, projectId: string, before?: number) {
  actor = identityActor(ctx, actor.id);
  project(ctx, actor, projectId);
  if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
    throw new DomainError('INVALID_CURSOR', 400);
  const sources = ctx.sqlite
    .prepare(
      'SELECT s.*,m.lastSeen AS machineLastSeen,m.revokedAt,a.name AS agentName FROM observation_sources s JOIN machines m ON m.id=s.machineId JOIN agents a ON a.id=s.agentId WHERE s.projectId=? ORDER BY s.lastSeen DESC LIMIT 100',
    )
    .all(projectId) as {
    id: string;
    state: string;
    machineLastSeen: number;
    revokedAt: number | null;
    lastActivity: number | null;
  }[];
  const records = ctx.sqlite
    .prepare(
      'SELECT r.*,s.agentId,s.provider,s.label FROM observation_records r JOIN observation_sources s ON s.id=r.sourceId WHERE s.projectId=? AND r.seq<? ORDER BY r.seq DESC LIMIT 101',
    )
    .all(projectId, before ?? Number.MAX_SAFE_INTEGER) as { seq: number }[];
  const page = records.slice(0, 100);
  return {
    sources: sources.map((s) => ({
      ...s,
      state:
        s.revokedAt !== null || ctx.now() - s.machineLastSeen > 45000
          ? 'offline'
          : ['observed', 'unchanged', 'partial'].includes(s.state) &&
              (s.lastActivity === null || ctx.now() - s.lastActivity > 60000)
            ? 'stale'
            : s.state,
    })),
    records: page,
    nextCursor: records.length > 100 ? page.at(-1)!.seq : null,
  };
}

import { randomUUID } from 'node:crypto';
import { DomainError, usageDelta, type Actor } from '@aether/kernel';
import type { RunnerEvent } from '@aether/contracts';
import { emit, type Context } from './context.js';
import { redact } from './approvals.js';
type Run = {
  id: string;
  projectId: string;
  agentId: string;
  workId: string;
  sessionId: string | null;
  state: string;
};
type ProviderReport = Extract<RunnerEvent, { type: 'provider' }>;

/** Stores the highest token counts seen for the turn and returns how much they grew since the last report. */
function recordTurnUsage(
  ctx: Context,
  scope: string[],
  event: { inputTokens: number; outputTokens: number },
) {
  const old = ctx.sqlite
    .prepare(
      'SELECT inputTokens,outputTokens FROM session_usage WHERE machineId=? AND agentId=? AND provider=? AND providerSessionId=? AND turnId=?',
    )
    .get(...scope) as { inputTokens: number; outputTokens: number } | undefined;
  const delta = usageDelta(
    { input: old?.inputTokens ?? 0, output: old?.outputTokens ?? 0 },
    { input: event.inputTokens, output: event.outputTokens },
  );
  ctx.sqlite
    .prepare(
      'INSERT INTO session_usage VALUES (?,?,?,?,?,?,?) ON CONFLICT(machineId,agentId,provider,providerSessionId,turnId) DO UPDATE SET inputTokens=MAX(inputTokens,excluded.inputTokens),outputTokens=MAX(outputTokens,excluded.outputTokens)',
    )
    .run(...scope, event.inputTokens, event.outputTokens);
  return delta;
}

/** Token usage of one turn: the growth since the last report is added to the run's totals and announced. */
function recordUsage(
  ctx: Context,
  actor: Actor,
  run: Run,
  report: ProviderReport,
  event: Extract<ProviderReport['event'], { kind: 'usage' }>,
) {
  const identity = ctx.sqlite
    .prepare('SELECT machineId,agentId,provider,providerSessionId FROM runs WHERE id=?')
    .get(run.id) as {
    machineId: string;
    agentId: string;
    provider: string;
    providerSessionId: string | null;
  };
  if (!identity.providerSessionId) throw new DomainError('USAGE_SESSION_REQUIRED');
  const scope = [
    identity.machineId,
    identity.agentId,
    identity.provider,
    identity.providerSessionId,
    event.turnId,
  ];
  const delta = recordTurnUsage(ctx, scope, event);
  ctx.sqlite
    .prepare(
      "INSERT INTO usage_totals(runId,turnId,inputTokens,outputTokens,source) VALUES (?,?,?,?,'native') ON CONFLICT(runId,turnId) DO UPDATE SET inputTokens=inputTokens+excluded.inputTokens,outputTokens=outputTokens+excluded.outputTokens",
    )
    .run(run.id, event.turnId, delta.input, delta.output);
  emit(
    ctx,
    actor,
    run.projectId,
    'usage.updated',
    { runId: run.id, sessionId: run.sessionId, turnId: event.turnId, delta },
    report.sourceEventId,
    run.id,
    'native',
  );
}

/** A tool's progress; a late duplicate "started" may not roll a terminal tool back, and a started tool acknowledges its approval. */
function recordTool(
  ctx: Context,
  run: Run,
  event: Extract<
    ProviderReport['event'],
    { kind: 'tool.requested' | 'tool.started' | 'tool.completed' | 'tool.failed' }
  >,
) {
  const state = event.kind.slice('tool.'.length);
  const existing = ctx.sqlite
    .prepare('SELECT state FROM tool_invocations WHERE runId=? AND providerToolId=?')
    .get(run.id, event.toolId) as { state: string } | undefined;
  if (!existing || !['completed', 'failed'].includes(existing.state)) {
    ctx.sqlite
      .prepare(
        'INSERT INTO tool_invocations(id,projectId,runId,sessionId,providerToolId,providerTurnId,parentToolId,name,state,summary,startedAt,endedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(runId,providerToolId) DO UPDATE SET state=excluded.state,summary=excluded.summary,endedAt=excluded.endedAt',
      )
      .run(
        randomUUID(),
        run.projectId,
        run.id,
        run.sessionId,
        event.toolId,
        event.turnId,
        event.parentToolId,
        event.name,
        state,
        String(redact(event.summary)),
        ctx.now(),
        ['completed', 'failed'].includes(state) ? ctx.now() : null,
      );
  }
  if (['started', 'completed', 'failed'].includes(state))
    ctx.sqlite
      .prepare(
        "UPDATE approval_decisions SET providerAcknowledgedAt=?,state='provider_acknowledged',version=version+1 WHERE runId=? AND toolId=? AND decision='approve' AND state IN ('decided','decision_sent')",
      )
      .run(ctx.now(), run.id, event.toolId);
}

export function recordProvider(ctx: Context, actor: Actor, run: Run, report: ProviderReport): void {
  if (!run.sessionId || !['running', 'cancel_requested', 'indeterminate'].includes(run.state))
    throw new DomainError('SESSION_NOT_RUNNING');
  const event = report.event;
  if (event.kind === 'session.started') {
    ctx.sqlite
      .prepare('UPDATE agent_sessions SET providerSessionId=? WHERE id=?')
      .run(event.providerSessionId, run.sessionId);
  } else if (event.kind === 'turn.started')
    ctx.sqlite.prepare('UPDATE runs SET providerTurnId=? WHERE id=?').run(event.turnId, run.id);
  else if (event.kind === 'usage') {
    recordUsage(ctx, actor, run, report, event);
    return;
  } else if (
    event.kind === 'tool.requested' ||
    event.kind === 'tool.started' ||
    event.kind === 'tool.completed' ||
    event.kind === 'tool.failed'
  )
    recordTool(ctx, run, event);
  emit(
    ctx,
    actor,
    run.projectId,
    event.kind,
    { ...recordSafe(event), runId: run.id, sessionId: run.sessionId, agentId: run.agentId },
    report.sourceEventId,
    run.id,
    'native',
  );
}
function recordSafe(event: unknown): Record<string, unknown> {
  return redact(event) as Record<string, unknown>;
}

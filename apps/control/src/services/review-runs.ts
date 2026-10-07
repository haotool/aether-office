import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { assertVersion, DomainError } from '@aether/kernel';
import { task, agent, type Context } from './context.js';
import { stepConstraint } from './step-constraint.js';
export function requestReview(ctx: Context, c: Extract<Command, { type: 'work.request_review' }>) {
  const work = task(ctx, c.projectId, c.data.workId);
  assertVersion(work.version, c.expectedVersion);
  if (work.state !== 'reviewing' || !work.headSha || work.reviewBy)
    throw new DomainError('REVIEW_NOT_READY');
  const reviewer = agent(ctx, c.projectId, c.data.agentId);
  if (reviewer.id === work.assignee) throw new DomainError('SELF_REVIEW_FORBIDDEN', 403);
  const required = stepConstraint(ctx, work.id)?.reviewerProvider;
  if (required && reviewer.provider !== required)
    throw new DomainError('WORKFLOW_PROVIDER_MISMATCH', 409);
  if (reviewer.mode !== 'live' || !['codex', 'claude'].includes(reviewer.provider))
    throw new DomainError('NATIVE_REVIEWER_REQUIRED');
  const policy = ctx.sqlite
    .prepare('SELECT liveEnabled,maxTurns,timeoutMs FROM project_policies WHERE projectId=?')
    .get(c.projectId) as { liveEnabled: number; maxTurns: number; timeoutMs: number } | undefined;
  if (!policy?.liveEnabled) throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
  if (
    ctx.sqlite
      .prepare(
        "SELECT 1 FROM runs WHERE workId=? AND state IN ('queued','claimed','running','cancel_requested','indeterminate')",
      )
      .get(work.id)
  )
    throw new DomainError('WORK_RUN_BUSY');
  const source = ctx.sqlite
    .prepare(
      "SELECT w.machineId,w.baseSha FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.workId=? AND w.purpose='implementation' AND w.headSha=? AND m.revokedAt IS NULL ORDER BY w.createdAt DESC,w.rowid DESC LIMIT 1",
    )
    .get(work.id, work.headSha) as { machineId: string; baseSha: string } | undefined;
  if (!source) throw new DomainError('REVIEW_WORKSPACE_REQUIRED');
  const runId = randomUUID(),
    sessionId = randomUUID(),
    id = randomUUID(),
    now = ctx.now();
  ctx.sqlite
    .prepare(
      'INSERT INTO agent_sessions(id,projectId,agentId,provider,state,createdAt) VALUES (?,?,?,?,?,?)',
    )
    .run(sessionId, c.projectId, reviewer.id, reviewer.provider, 'starting', now);
  ctx.sqlite
    .prepare(
      "INSERT INTO runs(id,projectId,workId,agentId,provider,mode,state,epoch,createdAt,sessionId,maxTurns,timeoutMs,machineId,purpose,reviewHead,reviewVersion,reviewBase) VALUES (?,?,?,?,?,'live','queued',1,?,?,?,?,?,'review',?,?,?)",
    )
    .run(
      runId,
      c.projectId,
      work.id,
      reviewer.id,
      reviewer.provider,
      now,
      sessionId,
      policy.maxTurns,
      policy.timeoutMs,
      source.machineId,
      work.headSha,
      work.version + 1,
      source.baseSha,
    );
  ctx.sqlite
    .prepare('INSERT INTO runner_commands(id,runId,projectId,epoch,createdAt) VALUES (?,?,?,1,?)')
    .run(id, runId, c.projectId, now);
  ctx.sqlite
    .prepare('UPDATE work_items SET version=version+1,updatedAt=? WHERE id=?')
    .run(now, work.id);
  return {
    runId,
    agentId: reviewer.id,
    workId: work.id,
    purpose: 'review',
    headSha: work.headSha,
    baseSha: source.baseSha,
    version: work.version + 1,
  };
}

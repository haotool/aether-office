import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { assertVersion, DomainError } from '@aether/kernel';
import { task, agent, type Context } from '../domain/context.js';
import { stepConstraint } from '../runtime/step-constraint.js';
type Policy = { liveEnabled: number; maxTurns: number; timeoutMs: number };
type Reviewer = ReturnType<typeof agent>;
type Work = ReturnType<typeof task>;

function assertReviewerFits(
  ctx: Context,
  projectId: string,
  work: Work,
  reviewer: Reviewer,
): Policy {
  if (reviewer.id === work.assignee) throw new DomainError('SELF_REVIEW_FORBIDDEN', 403);
  const required = stepConstraint(ctx, work.id)?.reviewerProvider;
  if (required && reviewer.provider !== required)
    throw new DomainError('WORKFLOW_PROVIDER_MISMATCH', 409);
  if (reviewer.mode !== 'live' || !['codex', 'claude'].includes(reviewer.provider))
    throw new DomainError('NATIVE_REVIEWER_REQUIRED');
  const policy = ctx.sqlite
    .prepare('SELECT liveEnabled,maxTurns,timeoutMs FROM project_policies WHERE projectId=?')
    .get(projectId) as Policy | undefined;
  if (!policy?.liveEnabled) throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
  return policy;
}

function reviewSource(ctx: Context, workId: string, headSha: string) {
  if (
    ctx.sqlite
      .prepare(
        "SELECT 1 FROM runs WHERE workId=? AND state IN ('queued','claimed','running','cancel_requested','indeterminate')",
      )
      .get(workId)
  )
    throw new DomainError('WORK_RUN_BUSY');
  const source = ctx.sqlite
    .prepare(
      "SELECT w.machineId,w.baseSha FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.workId=? AND w.purpose='implementation' AND w.headSha=? AND m.revokedAt IS NULL ORDER BY w.createdAt DESC,w.rowid DESC LIMIT 1",
    )
    .get(workId, headSha) as { machineId: string; baseSha: string } | undefined;
  if (!source) throw new DomainError('REVIEW_WORKSPACE_REQUIRED');
  return source;
}

function queueReview(
  ctx: Context,
  projectId: string,
  work: Work,
  reviewer: Reviewer,
  policy: Policy,
  source: { machineId: string; baseSha: string },
  headSha: string,
  ids: { runId: string; sessionId: string; id: string; now: number },
) {
  const { runId, sessionId, id, now } = ids;
  ctx.sqlite
    .prepare(
      'INSERT INTO agent_sessions(id,projectId,agentId,provider,state,createdAt) VALUES (?,?,?,?,?,?)',
    )
    .run(sessionId, projectId, reviewer.id, reviewer.provider, 'starting', now);
  ctx.sqlite
    .prepare(
      "INSERT INTO runs(id,projectId,workId,agentId,provider,mode,state,epoch,createdAt,sessionId,maxTurns,timeoutMs,machineId,purpose,reviewHead,reviewVersion,reviewBase) VALUES (?,?,?,?,?,'live','queued',1,?,?,?,?,?,'review',?,?,?)",
    )
    .run(
      runId,
      projectId,
      work.id,
      reviewer.id,
      reviewer.provider,
      now,
      sessionId,
      policy.maxTurns,
      policy.timeoutMs,
      source.machineId,
      headSha,
      work.version + 1,
      source.baseSha,
    );
  ctx.sqlite
    .prepare('INSERT INTO runner_commands(id,runId,projectId,epoch,createdAt) VALUES (?,?,?,1,?)')
    .run(id, runId, projectId, now);
  ctx.sqlite
    .prepare('UPDATE work_items SET version=version+1,updatedAt=? WHERE id=?')
    .run(now, work.id);
}

export function requestReview(ctx: Context, c: Extract<Command, { type: 'work.request_review' }>) {
  const work = task(ctx, c.projectId, c.data.workId);
  assertVersion(work.version, c.expectedVersion);
  const headSha = work.headSha;
  if (work.state !== 'reviewing' || !headSha || work.reviewBy)
    throw new DomainError('REVIEW_NOT_READY');
  const reviewer = agent(ctx, c.projectId, c.data.agentId);
  const policy = assertReviewerFits(ctx, c.projectId, work, reviewer);
  const source = reviewSource(ctx, work.id, headSha);
  const runId = randomUUID(),
    sessionId = randomUUID(),
    id = randomUUID(),
    now = ctx.now();
  queueReview(ctx, c.projectId, work, reviewer, policy, source, headSha, {
    runId,
    sessionId,
    id,
    now,
  });
  return {
    runId,
    agentId: reviewer.id,
    workId: work.id,
    purpose: 'review',
    headSha,
    baseSha: source.baseSha,
    version: work.version + 1,
  };
}

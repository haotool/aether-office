import { randomUUID } from 'node:crypto';
import { jobReportSchema, type RunnerJob, type Command } from '@aether/contracts';
import { authorize, assertVersion, DomainError, type Actor } from '@aether/kernel';
import { identityActor } from './identity.js';
import { task, emit, type Context } from './context.js';
type Work = ReturnType<typeof task>;

/** Queues a job for the runner that owns the workspace, bound to the work's head and version; returns its id. */
function queueJob(
  ctx: Context,
  actor: Actor,
  work: Work,
  headSha: string,
  workspace: { id: string; machineId: string },
  kind: 'integrate' | 'verify' | 'diff',
  payload: unknown,
) {
  const id = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO runner_jobs(id,projectId,workId,workspaceId,machineId,kind,state,payload,requestedBy,expectedHead,expectedVersion,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      work.projectId,
      work.id,
      workspace.id,
      workspace.machineId,
      kind,
      'queued',
      JSON.stringify(payload),
      actor.id,
      headSha,
      work.version,
      ctx.now(),
    );
  return id;
}

/** Integration is serial per project and never repeated for a commit that is already merged. */
function assertCanIntegrate(ctx: Context, projectId: string, workId: string, headSha: string) {
  if (
    ctx.sqlite
      .prepare(
        "SELECT 1 FROM runner_jobs WHERE projectId=? AND kind='integrate' AND state IN ('queued','running')",
      )
      .get(projectId)
  )
    throw new DomainError('INTEGRATION_BUSY');
  if (
    ctx.sqlite
      .prepare("SELECT 1 FROM integrations WHERE workId=? AND headSha=? AND status='merged'")
      .get(workId, headSha)
  )
    throw new DomainError('ALREADY_INTEGRATED');
}

export function requestIntegration(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'work.integrate' }>,
) {
  const work = task(ctx, c.projectId, c.data.workId);
  assertVersion(work.version, c.expectedVersion);
  // Only human-accepted work whose verified commit is exactly the current head may be integrated.
  if (work.state !== 'completed' || !work.headSha || work.verifiedSha !== work.headSha)
    throw new DomainError('INTEGRATION_REQUIRES_ACCEPTED_WORK');
  const workspace = ctx.sqlite
    .prepare(
      "SELECT w.id,w.machineId FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.workId=? AND w.purpose='implementation' AND m.revokedAt IS NULL ORDER BY w.createdAt DESC LIMIT 1",
    )
    .get(work.id) as { id: string; machineId: string } | undefined;
  if (!workspace) throw new DomainError('WORKSPACE_NOT_READY');
  // Serial: one integration per project at a time, so each one sees the previous result.
  assertCanIntegrate(ctx, c.projectId, work.id, work.headSha);
  const candidate = `aether/integrate/${work.id.slice(0, 8)}-${work.headSha.slice(0, 8)}`;
  const payload = {
    integrate: { baseBranch: c.data.baseBranch, expectedBase: c.data.expectedBase, candidate },
  };
  const id = queueJob(ctx, actor, work, work.headSha, workspace, 'integrate', payload);
  return { id, kind: 'integrate', state: 'queued', workId: work.id, candidate };
}
export function requestJob(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'work.verify' | 'workspace.diff' }>,
) {
  const work = task(ctx, c.projectId, c.data.workId);
  assertVersion(work.version, c.expectedVersion);
  const workspace = ctx.sqlite
    .prepare(
      "SELECT w.id,w.machineId,m.verifiers FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.workId=? AND w.purpose='implementation' AND m.revokedAt IS NULL ORDER BY w.createdAt DESC LIMIT 1",
    )
    .get(work.id) as { id: string; machineId: string; verifiers: string } | undefined;
  if (!workspace || !work.headSha) throw new DomainError('WORKSPACE_NOT_READY');
  if (c.type === 'work.verify' && (work.state !== 'reviewing' || !work.reviewBy))
    throw new DomainError('REVIEW_REQUIRED');
  const verifier =
    c.type === 'work.verify'
      ? (JSON.parse(workspace.verifiers) as { name: string; sourceHash: string }[]).find(
          (v) => v.name === c.data.verifier,
        )
      : undefined;
  if (c.type === 'work.verify' && !verifier) throw new DomainError('VERIFIER_NOT_GRANTED');
  if (
    ctx.sqlite
      .prepare("SELECT 1 FROM runner_jobs WHERE workspaceId=? AND state IN ('queued','running')")
      .get(workspace.id)
  )
    throw new DomainError('WORKSPACE_JOB_BUSY');
  const kind = c.type === 'work.verify' ? 'verify' : 'diff';
  const payload = { ...(verifier ? { verifier } : {}) };
  const id = queueJob(ctx, actor, work, work.headSha, workspace, kind, payload);
  return { id, kind, state: 'queued', workId: work.id };
}
function machine(ctx: Context, actor: Actor) {
  actor = identityActor(ctx, actor.id);
  authorize(actor, 'runner.report');
  if (
    !actor.machineId ||
    !ctx.sqlite
      .prepare('SELECT 1 FROM machines WHERE id=? AND revokedAt IS NULL')
      .get(actor.machineId)
  )
    throw new DomainError('MACHINE_REVOKED', 401);
  return actor;
}
export function claimJob(ctx: Context, actor: Actor): RunnerJob | null {
  actor = machine(ctx, actor);
  return ctx.sqlite
    .transaction(() => {
      if (
        ctx.sqlite
          .prepare("SELECT 1 FROM runner_jobs WHERE machineId=? AND state='running'")
          .get(actor.machineId)
      )
        return null;
      const row = ctx.sqlite
        .prepare(
          "SELECT id,projectId,workId,workspaceId,kind,expectedHead,payload FROM runner_jobs WHERE machineId=? AND state='queued' ORDER BY createdAt LIMIT 1",
        )
        .get(actor.machineId) as (Omit<RunnerJob, 'payload'> & { payload: string }) | undefined;
      if (!row) return null;
      authorize(actor, 'runner.report', row.projectId);
      ctx.sqlite
        .prepare("UPDATE runner_jobs SET state='running',startedAt=? WHERE id=?")
        .run(ctx.now(), row.id);
      return { ...row, payload: JSON.parse(row.payload) as RunnerJob['payload'] };
    })
    .immediate();
}
type JobRow = {
  id: string;
  projectId: string;
  workId: string;
  workspaceId: string;
  kind: string;
  state: string;
  result: string | null;
  payload: string;
  expectedHead: string;
  expectedVersion: number;
};
type JobReport = ReturnType<typeof jobReportSchema.parse>;

type Verification = NonNullable<JobReport['verification']>;

/** A run that touched nothing: same head, tree, index and base before and after, from a clean start. */
const isCleanRun = (v: Verification, baseSha: string) =>
  v.baseBefore === baseSha &&
  v.before.indexTree === v.before.tree &&
  v.after.indexTree === v.after.tree &&
  v.finishedAt >= v.startedAt &&
  v.before.status === '' &&
  v.after.status === '' &&
  v.before.head === v.after.head &&
  v.before.tree === v.after.tree &&
  v.before.indexTree === v.after.indexTree &&
  v.baseBefore === v.baseAfter;

/**
 * A successful verify job: its evidence must be for this job's workspace and harness, and the work becomes verified only
 * when the run was clean, passed, and still matches the head and version the job was started for.
 */
function recordVerification(ctx: Context, job: JobRow, work: Work, result: JobReport) {
  const v = result.verification;
  const requested = JSON.parse(job.payload) as RunnerJob['payload'];
  if (
    !v ||
    v.workspaceId !== job.workspaceId ||
    v.harnessSourceHash !== requested.verifier?.sourceHash
  )
    throw new DomainError('VERIFICATION_BINDING_MISMATCH');
  ctx.sqlite
    .prepare('INSERT INTO verification_evidence VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      v.id,
      job.projectId,
      work.id,
      v.workspaceId,
      v.harnessHash,
      v.before.head,
      v.after.head,
      v.baseBefore,
      v.baseAfter,
      v.status,
      v.logHash,
      v.exitCode,
      JSON.stringify(v),
      ctx.now(),
    );
  const base = ctx.sqlite
    .prepare('SELECT baseSha FROM workspaces WHERE id=?')
    .get(job.workspaceId) as { baseSha: string };
  const clean = isCleanRun(v, base.baseSha);
  if (
    job.state === 'running' &&
    v.status === 'passed' &&
    v.reason === null &&
    v.exitCode === 0 &&
    clean &&
    v.before.head === job.expectedHead &&
    work.headSha === job.expectedHead &&
    work.version === job.expectedVersion &&
    work.state === 'reviewing' &&
    work.reviewBy
  )
    ctx.sqlite
      .prepare(
        "UPDATE work_items SET state='verified',verifiedSha=?,version=version+1,updatedAt=? WHERE id=?",
      )
      .run(v.after.head, ctx.now(), work.id);
}

/** A successful integrate job: what was merged (or why the base moved), bound to the head it was started for. */
function recordIntegration(ctx: Context, job: JobRow, result: JobReport) {
  const i = result.integration;
  if (!i) throw new DomainError('INTEGRATION_REQUIRED');
  if (i.status !== 'base_moved' && i.headSha !== job.expectedHead)
    throw new DomainError('INTEGRATION_BINDING_MISMATCH');
  const spec = (JSON.parse(job.payload) as RunnerJob['payload']).integrate;
  ctx.sqlite
    .prepare('INSERT INTO integrations VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      job.id,
      job.projectId,
      job.workId,
      i.status,
      spec?.baseBranch ?? '',
      i.status === 'base_moved' ? i.expected : i.baseSha,
      job.expectedHead,
      i.status === 'merged' ? i.mergeSha : null,
      i.status === 'merged' ? i.candidate : null,
      JSON.stringify(i),
      ctx.now(),
    );
}

/** What a succeeded job must have produced, stored by kind. */
function recordEvidence(ctx: Context, job: JobRow, work: Work, result: JobReport) {
  if (job.kind === 'verify') recordVerification(ctx, job, work, result);
  if (job.kind === 'diff' && !result.diff) throw new DomainError('DIFF_REQUIRED');
  if (job.kind === 'integrate') recordIntegration(ctx, job, result);
}

export function reportJob(ctx: Context, actor: Actor, input: unknown) {
  actor = machine(ctx, actor);
  const result = jobReportSchema.parse(input);
  return ctx.sqlite
    .transaction(() => {
      const job = ctx.sqlite
        .prepare('SELECT * FROM runner_jobs WHERE id=? AND machineId=?')
        .get(result.jobId, actor.machineId) as JobRow | undefined;
      if (!job) throw new DomainError('JOB_NOT_FOUND', 404);
      authorize(actor, 'runner.report', job.projectId);
      if (job.result) {
        if (job.result !== JSON.stringify(result)) throw new DomainError('JOB_RESULT_CONFLICT');
        return { duplicate: true };
      }
      if (!['running', 'indeterminate'].includes(job.state))
        throw new DomainError('JOB_NOT_RUNNING');
      const work = task(ctx, job.projectId, job.workId);
      if (result.status === 'succeeded') recordEvidence(ctx, job, work, result);
      const state =
        job.state === 'indeterminate' || result.error === 'RUNNER_RESTARTED_RESULT_UNKNOWN'
          ? 'indeterminate'
          : result.status;
      if (work.state === 'cancel_requested')
        ctx.sqlite
          .prepare('UPDATE work_items SET state=?,version=version+1,updatedAt=? WHERE id=?')
          .run(state === 'indeterminate' ? 'indeterminate' : 'cancelled', ctx.now(), work.id);
      ctx.sqlite
        .prepare('UPDATE runner_jobs SET state=?,result=?,finishedAt=? WHERE id=?')
        .run(state, JSON.stringify(result), ctx.now(), job.id);
      emit(
        ctx,
        actor,
        job.projectId,
        'workspace.job.finished',
        {
          jobId: job.id,
          kind: job.kind,
          status: result.status,
          workId: job.workId,
          verification: result.verification ?? null,
        },
        job.id,
        job.id,
        'native',
      );
      return { duplicate: false };
    })
    .immediate();
}
export function listIntegrations(ctx: Context, actor: Actor, projectId: string, workId: string) {
  authorize(actor, 'read', projectId);
  // Every attempt is listed, including queued and failed ones, so a failure is never invisible.
  const rows = ctx.sqlite
    .prepare(
      "SELECT j.id AS jobId,j.state,j.result AS jobResult,j.createdAt,i.status,i.baseBranch,i.headSha,i.candidate,i.detail FROM runner_jobs j LEFT JOIN integrations i ON i.jobId=j.id WHERE j.projectId=? AND j.workId=? AND j.kind='integrate' ORDER BY j.createdAt DESC",
    )
    .all(projectId, workId) as {
    jobId: string;
    state: string;
    jobResult: string | null;
    createdAt: number;
    status: string | null;
    baseBranch: string | null;
    headSha: string | null;
    candidate: string | null;
    detail: string | null;
  }[];
  return {
    integrations: rows.map(({ jobResult, detail, ...row }) => ({
      ...row,
      error: jobResult ? ((JSON.parse(jobResult) as { error?: string }).error ?? null) : null,
      detail: detail ? (JSON.parse(detail) as unknown) : null,
    })),
  };
}

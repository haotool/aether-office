import { randomUUID } from 'node:crypto';
import { jobReportSchema, type RunnerJob, type Command } from '@aether/contracts';
import { authorize, assertVersion, DomainError, type Actor } from '@aether/kernel';
import { identityActor } from './identity.js';
import { task, emit, type Context } from './context.js';
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
  const id = randomUUID();
  const payload = { ...(verifier ? { verifier } : {}) };
  ctx.sqlite
    .prepare(
      'INSERT INTO runner_jobs(id,projectId,workId,workspaceId,machineId,kind,state,payload,requestedBy,expectedHead,expectedVersion,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      c.projectId,
      work.id,
      workspace.id,
      workspace.machineId,
      c.type === 'work.verify' ? 'verify' : 'diff',
      'queued',
      JSON.stringify(payload),
      actor.id,
      work.headSha,
      work.version,
      ctx.now(),
    );
  return {
    id,
    kind: c.type === 'work.verify' ? 'verify' : 'diff',
    state: 'queued',
    workId: work.id,
  };
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
export function reportJob(ctx: Context, actor: Actor, input: unknown) {
  actor = machine(ctx, actor);
  const result = jobReportSchema.parse(input);
  return ctx.sqlite
    .transaction(() => {
      const job = ctx.sqlite
        .prepare('SELECT * FROM runner_jobs WHERE id=? AND machineId=?')
        .get(result.jobId, actor.machineId) as
        | {
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
          }
        | undefined;
      if (!job) throw new DomainError('JOB_NOT_FOUND', 404);
      authorize(actor, 'runner.report', job.projectId);
      if (job.result) {
        if (job.result !== JSON.stringify(result)) throw new DomainError('JOB_RESULT_CONFLICT');
        return { duplicate: true };
      }
      if (!['running', 'indeterminate'].includes(job.state))
        throw new DomainError('JOB_NOT_RUNNING');
      const work = task(ctx, job.projectId, job.workId);
      const v = result.verification;
      if (result.status === 'succeeded' && job.kind === 'verify') {
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
        const clean =
          v.baseBefore === base.baseSha &&
          v.before.indexTree === v.before.tree &&
          v.after.indexTree === v.after.tree &&
          v.finishedAt >= v.startedAt &&
          v.before.status === '' &&
          v.after.status === '' &&
          v.before.head === v.after.head &&
          v.before.tree === v.after.tree &&
          v.before.indexTree === v.after.indexTree &&
          v.baseBefore === v.baseAfter;
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
      if (result.status === 'succeeded' && job.kind === 'diff' && !result.diff)
        throw new DomainError('DIFF_REQUIRED');
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
          verification: v ?? null,
        },
        job.id,
        job.id,
        'native',
      );
      return { duplicate: false };
    })
    .immediate();
}

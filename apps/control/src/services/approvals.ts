import { randomUUID, createHash } from 'node:crypto';
import { DomainError, authorize, assertVersion, type Actor } from '@aether/kernel';
import { z } from 'zod';
import { emit, type Context } from './context.js';
import { identityActor } from './identity.js';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /token|password|secret|authorization|cookie|private.?key/i.test(key)
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  if (typeof value === 'string')
    return value
      .replace(/\b(sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{15,})\b/g, '[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[REDACTED]');
  return value;
}
const requestSchema = z
  .object({
    runId: z.string().uuid(),
    epoch: z.number().int().positive(),
    requestId: z.string().min(1).max(200),
    kind: z.string().min(1).max(100),
    toolId: z.string().min(1).max(200),
    turnId: z.string().max(200),
    providerSessionId: z.string().min(1).max(200),
    parameters: z.record(z.string(), z.unknown()),
  })
  .strict();
function ownedRun(ctx: Context, actor: Actor, runId: string, epoch?: number) {
  actor = identityActor(ctx, actor.id);
  authorize(actor, 'runner.report');
  if (
    !ctx.sqlite
      .prepare('SELECT 1 FROM machines WHERE id=? AND revokedAt IS NULL')
      .get(actor.machineId)
  )
    throw new DomainError('MACHINE_REVOKED', 401);
  const run = ctx.sqlite
    .prepare('SELECT * FROM runs WHERE id=? AND machineId=?')
    .get(runId, actor.machineId) as
    | {
        id: string;
        sessionId: string | null;
        projectId: string;
        agentId: string;
        epoch: number;
        state: string;
        providerSessionId: string | null;
        purpose: string;
      }
    | undefined;
  if (!run || (epoch !== undefined && epoch !== run.epoch))
    throw new DomainError('RUN_LEASE_MISMATCH', 403);
  authorize(actor, 'runner.report', run.projectId);
  return run;
}
type RequestData = z.infer<typeof requestSchema>;
/** Records a pending approval for the run, marks its agent as waiting and announces the request. */
function storeRequest(
  ctx: Context,
  actor: Actor,
  run: ReturnType<typeof ownedRun>,
  data: RequestData,
  actionHash: string,
) {
  const id = randomUUID(),
    expiresAt = ctx.now() + 120000;
  ctx.sqlite
    .prepare(
      'INSERT INTO approval_decisions(id,projectId,runId,providerRequestId,actionHash,parameters,expiresAt,sessionId,toolId,kind,state) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      run.projectId,
      run.id,
      data.requestId,
      actionHash,
      JSON.stringify(redact(data.parameters)),
      expiresAt,
      run.sessionId,
      data.toolId,
      data.kind,
      'pending',
    );
  ctx.sqlite
    .prepare("UPDATE agents SET activity='waiting_permission',version=version+1 WHERE id=?")
    .run(run.agentId);
  emit(
    ctx,
    actor,
    run.projectId,
    'approval.requested',
    {
      id,
      runId: run.id,
      sessionId: run.sessionId,
      kind: data.kind,
      actionHash,
      parameters: redact(data.parameters),
      expiresAt,
    },
    data.requestId,
    run.id,
    'native',
  );
  return { id, actionHash, expiresAt };
}
export function requestApproval(ctx: Context, actor: Actor, input: unknown) {
  const data = requestSchema.parse(input);
  const run = ownedRun(ctx, actor, data.runId, data.epoch);
  if (run.purpose === 'review') throw new DomainError('REVIEW_ESCALATION_FORBIDDEN', 403);
  if (!run.sessionId || run.providerSessionId !== data.providerSessionId || run.state !== 'running')
    throw new DomainError('APPROVAL_SESSION_MISMATCH', 409);
  const actionHash = createHash('sha256')
    .update(canonical({ ...data, sessionId: run.sessionId }))
    .digest('hex');
  return ctx.sqlite
    .transaction(() => {
      const prior = ctx.sqlite
        .prepare(
          'SELECT id,actionHash,expiresAt FROM approval_decisions WHERE runId=? AND providerRequestId=?',
        )
        .get(run.id, data.requestId) as
        { id: string; actionHash: string; expiresAt: number } | undefined;
      if (prior) {
        if (prior.actionHash !== actionHash) throw new DomainError('APPROVAL_PARAMETERS_CHANGED');
        return prior;
      }
      return storeRequest(ctx, actor, run, data, actionHash);
    })
    .immediate();
}
export function decideApproval(
  ctx: Context,
  actor: Actor,
  projectId: string,
  expectedVersion: number,
  input: { approvalId: string; actionHash: string; decision: 'approve' | 'deny' },
) {
  actor = identityActor(ctx, actor.id);
  authorize(actor, 'approval.decide', projectId);
  const row = ctx.sqlite
    .prepare(
      'SELECT a.*,r.state AS runState FROM approval_decisions a JOIN runs r ON r.id=a.runId WHERE a.id=? AND a.projectId=?',
    )
    .get(input.approvalId, projectId) as
    | {
        id: string;
        actionHash: string;
        expiresAt: number;
        state: string;
        runState: string;
        version: number;
      }
    | undefined;
  if (!row) throw new DomainError('APPROVAL_NOT_FOUND', 404);
  assertVersion(row.version, expectedVersion);
  if (row.actionHash !== input.actionHash) throw new DomainError('APPROVAL_PARAMETERS_CHANGED');
  if (row.expiresAt <= ctx.now() || row.state !== 'pending' || row.runState !== 'running')
    throw new DomainError('APPROVAL_EXPIRED_OR_RESOLVED');
  ctx.sqlite
    .prepare(
      "UPDATE approval_decisions SET decision=?,decidedBy=?,decidedAt=?,state='decided',version=version+1 WHERE id=?",
    )
    .run(input.decision, actor.id, ctx.now(), row.id);
  return {
    id: row.id,
    decision: input.decision,
    state: 'decided',
    version: row.version + 1,
    providerAcknowledgedAt: null,
  };
}
export function pollApproval(ctx: Context, actor: Actor, runId: string, approvalId: string) {
  const run = ownedRun(ctx, actor, runId);
  const row = ctx.sqlite
    .prepare(
      'SELECT id,actionHash,decision,decidedBy,expiresAt,state,toolId FROM approval_decisions WHERE id=? AND runId=?',
    )
    .get(approvalId, runId) as
    | {
        id: string;
        actionHash: string;
        decision: 'approve' | 'deny' | null;
        decidedBy: string | null;
        expiresAt: number;
        state: string;
        toolId: string;
      }
    | undefined;
  if (!row) throw new DomainError('APPROVAL_NOT_FOUND', 404);
  let authorized = true;
  if (row.decision === 'approve') {
    try {
      authorize(identityActor(ctx, row.decidedBy ?? ''), 'approval.decide', run.projectId);
    } catch {
      authorized = false;
    }
  }
  if (
    row.expiresAt <= ctx.now() ||
    run.state !== 'running' ||
    row.state === 'expired' ||
    !authorized
  ) {
    ctx.sqlite
      .prepare(
        "UPDATE approval_decisions SET state='expired',version=version+1 WHERE id=? AND state IN ('pending','decided')",
      )
      .run(row.id);
    return { id: row.id, decision: 'deny' as const, state: 'expired' };
  }
  return { id: row.id, decision: row.decision, state: row.state };
}
export function approvalSent(ctx: Context, actor: Actor, runId: string, requestId: string) {
  ownedRun(ctx, actor, runId);
  const result = ctx.sqlite
    .prepare(
      "UPDATE approval_decisions SET state='decision_sent',decisionSentAt=?,version=version+1 WHERE runId=? AND providerRequestId=? AND state='decided' AND expiresAt>?",
    )
    .run(ctx.now(), runId, requestId, ctx.now());
  return { recorded: result.changes > 0 };
}

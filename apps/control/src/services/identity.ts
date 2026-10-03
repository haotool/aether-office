import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DomainError, authorize, type Actor, type Role } from '@aether/kernel';
import { identities } from '../db/schema.js';
import type { Context } from './context.js';
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const secret = (): string => randomBytes(32).toString('base64url');
export function identityActor(ctx: Context, id: string): Actor {
  const row = ctx.db.select().from(identities).where(eq(identities.id, id)).get();
  if (!row || row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= ctx.now()))
    throw new DomainError('AUTH_REQUIRED', 401);
  const execution = ctx.sqlite
    .prepare(
      'SELECT r.id,r.workId,r.state,r.purpose,m.revokedAt FROM session_credentials c JOIN runs r ON r.id=c.runId JOIN machines m ON m.id=c.machineId WHERE c.identityId=?',
    )
    .get(id) as
    | { id: string; workId: string; state: string; purpose: string; revokedAt: number | null }
    | undefined;
  if (
    execution &&
    (execution.revokedAt !== null || !['claimed', 'running'].includes(execution.state))
  )
    throw new DomainError('SESSION_CREDENTIAL_EXPIRED', 401);
  return {
    id: row.id,
    role: row.role,
    projectIds: row.projectIds,
    ...(execution
      ? { runId: execution.id, workId: execution.workId, runPurpose: execution.purpose }
      : {}),
    ...(row.agentId ? { agentId: row.agentId } : {}),
    ...(row.machineId ? { machineId: row.machineId } : {}),
  };
}
export function authenticate(ctx: Context, token: string): Actor {
  if (token.length < 32 || token.length > 256) throw new DomainError('AUTH_REQUIRED', 401);
  const row = ctx.db
    .select({ id: identities.id })
    .from(identities)
    .where(eq(identities.tokenHash, hash(token)))
    .get();
  if (!row) throw new DomainError('AUTH_REQUIRED', 401);
  return identityActor(ctx, row.id);
}
export function createIdentity(
  ctx: Context,
  by: Actor | undefined,
  options: {
    name: string;
    role: Role;
    projectIds: string[];
    agentId?: string;
    machineId?: string;
    ttlMs?: number;
  },
) {
  if (by) authorize(by, 'identity.manage');
  else if (ctx.sqlite.prepare('SELECT 1 FROM identities LIMIT 1').get())
    throw new DomainError('ALREADY_BOOTSTRAPPED');
  if (!by && options.role !== 'owner') throw new DomainError('OWNER_REQUIRED');
  if (!['owner', 'operator', 'reviewer', 'viewer', 'agent', 'runner'].includes(options.role))
    throw new DomainError('INVALID_ROLE', 400);
  if (
    by &&
    !by.projectIds.includes('*') &&
    options.projectIds.some((p) => !by.projectIds.includes(p))
  )
    throw new DomainError('PROJECT_FORBIDDEN', 403);
  if (options.role === 'agent' && (!options.agentId || options.projectIds.length !== 1))
    throw new DomainError('AGENT_SCOPE_REQUIRED', 400);
  if (options.role === 'runner' && !options.machineId)
    throw new DomainError('MACHINE_SCOPE_REQUIRED', 400);
  const token = secret();
  const id = randomUUID();
  ctx.db
    .insert(identities)
    .values({
      id,
      name: options.name,
      role: options.role,
      tokenHash: hash(token),
      projectIds: options.projectIds,
      agentId: options.agentId ?? null,
      machineId: options.machineId ?? null,
      revokedAt: null,
      createdAt: ctx.now(),
      expiresAt: options.ttlMs ? ctx.now() + options.ttlMs : null,
    })
    .run();
  return { token, actor: identityActor(ctx, id) };
}
export function login(ctx: Context, token: string) {
  const actor = authenticate(ctx, token);
  if (actor.role === 'runner' || actor.role === 'agent')
    throw new DomainError('BROWSER_ROLE_REQUIRED', 403);
  const session = secret();
  const csrf = secret();
  const expiresAt = ctx.now() + 8 * 60 * 60 * 1000;
  ctx.sqlite
    .prepare('INSERT INTO browser_sessions VALUES (?,?,?,?)')
    .run(hash(session), actor.id, hash(csrf), expiresAt);
  return { session, csrf, expiresAt, actor };
}
export function sessionActor(ctx: Context, session: string, csrf?: string): Actor {
  const row = ctx.sqlite
    .prepare('SELECT * FROM browser_sessions WHERE tokenHash=?')
    .get(hash(session)) as { identityId: string; csrfHash: string; expiresAt: number } | undefined;
  if (!row || row.expiresAt <= ctx.now()) throw new DomainError('AUTH_REQUIRED', 401);
  if (csrf !== undefined) {
    const expected = Buffer.from(row.csrfHash);
    const got = Buffer.from(hash(csrf));
    if (expected.length !== got.length || !timingSafeEqual(expected, got))
      throw new DomainError('CSRF_REQUIRED', 403);
  }
  return identityActor(ctx, row.identityId);
}
export function revoke(ctx: Context, by: Actor, id: string): void {
  authorize(by, 'identity.manage');
  const target = identityActor(ctx, id);
  if (!by.projectIds.includes('*') && target.projectIds.some((p) => !by.projectIds.includes(p)))
    throw new DomainError('PROJECT_FORBIDDEN', 403);
  ctx.sqlite
    .transaction(() => {
      ctx.db.update(identities).set({ revokedAt: ctx.now() }).where(eq(identities.id, id)).run();
      ctx.sqlite.prepare('DELETE FROM browser_sessions WHERE identityId=?').run(id);
      if (target.machineId) {
        ctx.sqlite
          .prepare("UPDATE machines SET revokedAt=?,state='offline' WHERE id=?")
          .run(ctx.now(), target.machineId);
        ctx.sqlite
          .prepare(
            "UPDATE work_items SET state='indeterminate',version=version+1,updatedAt=? WHERE id IN (SELECT workId FROM runs WHERE machineId=? AND purpose='implementation' AND state IN ('claimed','running','cancel_requested'))",
          )
          .run(ctx.now(), target.machineId);
        ctx.sqlite
          .prepare(
            "UPDATE agents SET activity='unknown',version=version+1 WHERE id IN (SELECT agentId FROM runs WHERE machineId=? AND state IN ('claimed','running','cancel_requested'))",
          )
          .run(target.machineId);
        ctx.sqlite
          .prepare(
            "UPDATE runs SET state='indeterminate' WHERE machineId=? AND state IN ('claimed','running','cancel_requested')",
          )
          .run(target.machineId);
      }
    })
    .immediate();
}

import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { DomainError, authorize, type Actor, type Role } from '@aether/kernel';
import { insertRow, selectOne, updateRows } from '../../db/query.js';
import { identities } from '../../db/schema.js';
import type { Context } from './context.js';
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const secret = (): string => randomBytes(32).toString('base64url');
export function activeOwnerId(ctx: Context): string | undefined {
  return ctx.sqlite
    .prepare(
      "SELECT id FROM identities WHERE role='owner' AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt>?) ORDER BY createdAt LIMIT 1",
    )
    .pluck()
    .get(ctx.now()) as string | undefined;
}
export function identityActor(ctx: Context, id: string): Actor {
  const row = selectOne(ctx.sqlite, identities, { id });
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
  const row = selectOne(ctx.sqlite, identities, { tokenHash: hash(token) });
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
  insertRow(ctx.sqlite, identities, {
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
  });
  return { token, actor: identityActor(ctx, id) };
}
const SESSION_MS = 8 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function login(ctx: Context, token: string, ttlMs = SESSION_MS) {
  return openSession(ctx, authenticate(ctx, token), ttlMs);
}
/** A new session for an identity. Always a fresh id: a session is never carried over from before signing in. */
export function openSession(ctx: Context, actor: Actor, ttlMs = SESSION_MS) {
  if (actor.role === 'runner' || actor.role === 'agent')
    throw new DomainError('BROWSER_ROLE_REQUIRED', 403);
  const session = secret();
  const csrf = secret();
  const expiresAt = ctx.now() + ttlMs;
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
/**
 * The session cookie is the credential: the old CSRF token stops working in the same statement, so there is no moment
 * with two.
 */
export function rotateCsrf(ctx: Context, session: string): { csrf: string; expiresAt: number } {
  const who = sessionActor(ctx, session);
  if (who.role === 'runner' || who.role === 'agent')
    throw new DomainError('BROWSER_ROLE_REQUIRED', 403);
  const csrf = secret();
  const row = ctx.sqlite
    .prepare(
      'UPDATE browser_sessions SET csrfHash=? WHERE tokenHash=? AND expiresAt>? RETURNING expiresAt',
    )
    .get(hash(csrf), hash(session), ctx.now()) as { expiresAt: number } | undefined;
  if (!row) throw new DomainError('AUTH_REQUIRED', 401);
  return { csrf, expiresAt: row.expiresAt };
}
export function revoke(ctx: Context, by: Actor, id: string): void {
  authorize(by, 'identity.manage');
  const target = identityActor(ctx, id);
  if (!by.projectIds.includes('*') && target.projectIds.some((p) => !by.projectIds.includes(p)))
    throw new DomainError('PROJECT_FORBIDDEN', 403);
  ctx.sqlite
    .transaction(() => {
      updateRows(ctx.sqlite, identities, { id }, { revokedAt: ctx.now() });
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

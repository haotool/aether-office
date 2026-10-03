import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { DomainError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';
import { hash, secret } from './identity.js';

export type A2AClient = {
  id: string;
  name: string;
  projectId: string;
  maxOpen: number;
  createdBy: string;
};

/** Credentials for remote A2A agents. The token is shown once; only its hash is stored. */
export function createA2AClient(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'a2a.client.create' }>,
) {
  const token = `a2a_${secret()}`;
  const id = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO a2a_clients(id,name,tokenHash,projectId,maxOpen,createdBy,createdAt) VALUES (?,?,?,?,?,?,?)',
    )
    .run(id, c.data.name, hash(token), c.projectId, c.data.maxOpen, actor.id, ctx.now());
  return { id, token };
}

export function revokeA2AClient(ctx: Context, c: Extract<Command, { type: 'a2a.client.revoke' }>) {
  const done = ctx.sqlite
    .prepare('UPDATE a2a_clients SET revokedAt=? WHERE id=? AND projectId=? AND revokedAt IS NULL')
    .run(ctx.now(), c.data.clientId, c.projectId);
  if (!done.changes) throw new DomainError('A2A_CLIENT_NOT_FOUND', 404);
  return { clientId: c.data.clientId, revoked: true };
}

export function authenticateA2AClient(ctx: Context, header: string | undefined): A2AClient {
  if (!header?.startsWith('Bearer ')) throw new DomainError('AUTH_REQUIRED', 401);
  const row = ctx.sqlite
    .prepare(
      'SELECT id,name,projectId,maxOpen,createdBy FROM a2a_clients WHERE tokenHash=? AND revokedAt IS NULL',
    )
    .get(hash(header.slice(7))) as A2AClient | undefined;
  if (!row) throw new DomainError('AUTH_REQUIRED', 401);
  return row;
}

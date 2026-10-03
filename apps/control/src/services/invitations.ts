import { randomUUID } from 'node:crypto';
import type { Command } from '@aether/contracts';
import { DomainError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';
import { createIdentity, hash, identityActor, secret } from './identity.js';

/**
 * Short-lived, single-use enrollment. The invitation token is shown once and only its hash is
 * stored. Redeeming it returns a machine credential bound to exactly one project, a provider
 * allowlist and workspace roots; it is not a general shell or admin token.
 */
export function createInvitation(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'machine.invite' }>,
) {
  const token = `inv_${secret()}`;
  const now = ctx.now();
  const id = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO machine_invitations(id,tokenHash,projectId,name,concurrency,providers,roots,createdBy,expiresAt) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      hash(token),
      c.projectId,
      c.data.name,
      c.data.concurrency,
      JSON.stringify(c.data.providers),
      JSON.stringify(c.data.roots),
      actor.id,
      now + c.data.ttlSec * 1000,
    );
  return { id, token, expiresAt: now + c.data.ttlSec * 1000 };
}

export function redeemInvitation(
  ctx: Context,
  token: string,
): { machineId: string; token: string } {
  return ctx.sqlite
    .transaction(() => {
      const now = ctx.now();
      // The conditional UPDATE is the single-use gate: only one redemption can match.
      const claimed = ctx.sqlite
        .prepare(
          'UPDATE machine_invitations SET usedAt=? WHERE tokenHash=? AND usedAt IS NULL AND expiresAt>? RETURNING *',
        )
        .get(now, hash(token), now) as
        | {
            id: string;
            projectId: string;
            name: string;
            concurrency: number;
            providers: string;
            roots: string;
            createdBy: string;
          }
        | undefined;
      if (!claimed) throw new DomainError('INVITATION_INVALID', 401);
      let creator: Actor;
      try {
        creator = identityActor(ctx, claimed.createdBy);
      } catch {
        throw new DomainError('INVITATION_INVALID', 401);
      }
      const machineId = randomUUID();
      ctx.sqlite
        .prepare(
          "INSERT INTO machines(id,name,projectIds,lastSeen,state,concurrency,allowedProviders,allowedRoots) VALUES (?,?,?,?,'offline',?,?,?)",
        )
        .run(
          machineId,
          claimed.name,
          JSON.stringify([claimed.projectId]),
          now,
          claimed.concurrency,
          claimed.providers,
          claimed.roots,
        );
      const identity = createIdentity(ctx, creator, {
        name: claimed.name,
        role: 'runner',
        projectIds: [claimed.projectId],
        machineId,
      });
      ctx.sqlite
        .prepare('UPDATE machine_invitations SET machineId=? WHERE id=?')
        .run(machineId, claimed.id);
      return { machineId, token: identity.token };
    })
    .immediate();
}

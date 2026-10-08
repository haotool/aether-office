import { authorize, DomainError, type Actor } from '@aether/kernel';
import { type Context } from '../domain/context.js';
import { identityActor } from '../domain/identity.js';

/** The machine behind a runner's credential: its row, or a 401 once it is revoked. */
export function machine(ctx: Context, actor: Actor) {
  actor = identityActor(ctx, actor.id);
  authorize(actor, 'runner.report');
  const row = ctx.sqlite
    .prepare('SELECT * FROM machines WHERE id=? AND revokedAt IS NULL')
    .get(actor.machineId) as
    | {
        id: string;
        projectIds: string;
        concurrency: number;
        allowedProviders: string;
        allowedRoots: string;
      }
    | undefined;
  if (!row) throw new DomainError('MACHINE_REVOKED', 401);
  return { actor, row };
}

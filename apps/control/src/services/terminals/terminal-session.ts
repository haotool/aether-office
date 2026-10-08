import { DomainError } from '@aether/kernel';
import { type Context } from '../domain/context.js';

/** A terminal session row, or a 404 when the project has no such terminal. */
export type Session = {
  id: string;
  projectId: string;
  machineId: string;
  state: string;
  controlOwner: string | null;
  controlEpoch: number;
  leaseUntil: number | null;
};
export function session(ctx: Context, projectId: string, id: string): Session {
  const row = ctx.sqlite
    .prepare('SELECT * FROM terminal_sessions WHERE id=? AND projectId=?')
    .get(id, projectId) as Session | undefined;
  if (!row) throw new DomainError('TERMINAL_NOT_FOUND', 404);
  return row;
}

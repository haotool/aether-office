import type { Context } from '../domain/context.js';

export function stepConstraint(
  ctx: Context,
  workId: string,
): { engineerProvider: string | null; reviewerProvider: string | null } | undefined {
  return ctx.sqlite
    .prepare('SELECT engineerProvider,reviewerProvider FROM workflow_steps WHERE workId=?')
    .get(workId) as
    { engineerProvider: string | null; reviewerProvider: string | null } | undefined;
}

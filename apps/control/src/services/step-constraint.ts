import type { Context } from './context.js';

/** The provider a step requires of its engineer or reviewer, if the step belongs to a workflow that fixes one. */
export function stepConstraint(
  ctx: Context,
  workId: string,
): { engineerProvider: string | null; reviewerProvider: string | null } | undefined {
  return ctx.sqlite
    .prepare('SELECT engineerProvider,reviewerProvider FROM workflow_steps WHERE workId=?')
    .get(workId) as
    { engineerProvider: string | null; reviewerProvider: string | null } | undefined;
}

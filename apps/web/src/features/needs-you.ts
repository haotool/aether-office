import type { Snapshot } from '@aether/contracts';

/** A task in one of these states waits for a person: a review, an acceptance, or a failure to look at. */
const WORK_NEEDING_A_PERSON = ['reviewing', 'verified', 'failed', 'indeterminate', 'blocked'];

/**
 * What the tab bar's badges count: things that need a person, not how many things exist. A badge that always shows the
 * total teaches people to ignore badges.
 */
export function needsYou(data: Snapshot | undefined, pendingApprovals: number) {
  return {
    tasks: data?.work.filter((w) => WORK_NEEDING_A_PERSON.includes(w.state)).length ?? 0,
    messages:
      data?.messages.filter(
        (m) => m.kind === 'request' && m.deliveries.some((d) => d.acknowledgedAt === null),
      ).length ?? 0,
    more: pendingApprovals,
  };
}

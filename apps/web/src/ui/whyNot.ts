import type { Key } from '../lib/i18n/i18n.js';

export const REASONS = [
  'needOperator',
  'needOwner',
  'whyBusy',
  'whyNoText',
  'whyNothingToUndo',
  'whyNothingToRedo',
  'whyPickSession',
  'whyAtNewest',
  'whyNoOlder',
  'whyNoAgents',
  'whyNoAttempts',
  'whyNoCommit',
  'whyTerminalNotRunning',
  'whyTerminalNotHeld',
  'whyNoReviewer',
  'whyIntegrationOff',
  'whySessionRunning',
  'whyNotDecidable',
  'whyNothingToCopy',
  'whySendToRoom',
  'whyNoDiff',
  'whyNoMatch',
  'whyReadOnly',
  'resumeUnsupported',
] as const satisfies readonly Key[];
export type Why = ReturnType<typeof whyNot>;
export type Reason = (typeof REASONS)[number];
export const reasonId = (reason: Reason) => `why-${reason}`;

export type Need = readonly [holds: boolean, reason: Reason];

/**
 * The first unmet need becomes the control's title and, for a screen reader (which a title alone does not reach), its
 * description.
 */
export function whyNot(t: (key: Key) => string, ...needs: Need[]) {
  const unmet = needs.find(([holds]) => !holds);
  return unmet ? { title: t(unmet[1]), 'aria-describedby': reasonId(unmet[1]) } : {};
}

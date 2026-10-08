import type { Key } from '../i18n.js';

/** Every reason a control can give for being off. `ReasonDefs` renders each once, so `aria-describedby` can name it. */
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

/** A condition a control needs and the reason to give when it does not hold. */
export type Need = readonly [holds: boolean, reason: Reason];

/**
 * The attributes that tell a person why a control is off: nothing while every need holds, otherwise the first one
 * that does not as the control's title and (for a screen reader, which a title alone does not reach) its description.
 */
export function whyNot(t: (key: Key) => string, ...needs: Need[]) {
  const unmet = needs.find(([holds]) => !holds);
  return unmet ? { title: t(unmet[1]), 'aria-describedby': reasonId(unmet[1]) } : {};
}

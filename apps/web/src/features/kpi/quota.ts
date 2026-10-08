import type { ClaudeLimits } from '@aether/contracts';

export const WARN_AT = 85;

/** Pure. The figure for the top bar: the 5-hour and 7-day usage, whichever of them is known. */
export const quotaText = (limits: ClaudeLimits) =>
  [limits.fiveHour, limits.sevenDay]
    .map((w) => (w ? `${Math.round(w.usedPercent)}` : '–'))
    .join('·') + '%';

/** Pure. Whether either window is close to its limit. */
export const quotaNearLimit = (limits: ClaudeLimits) =>
  Math.max(limits.fiveHour?.usedPercent ?? 0, limits.sevenDay?.usedPercent ?? 0) >= WARN_AT;

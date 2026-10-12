import type { ClaudeLimits } from '@aether/contracts';

export const WARN_AT = 85;

export const quotaText = (limits: ClaudeLimits) =>
  [limits.fiveHour, limits.sevenDay]
    .map((w) => (w ? `${Math.round(w.usedPercent)}` : '–'))
    .join('·') + '%';

export const quotaNearLimit = (limits: ClaudeLimits) =>
  Math.max(limits.fiveHour?.usedPercent ?? 0, limits.sevenDay?.usedPercent ?? 0) >= WARN_AT;

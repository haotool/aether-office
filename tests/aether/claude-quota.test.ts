import { expect, it } from 'vitest';
import { quotaNearLimit, quotaText } from '../../apps/web/src/features/quota.js';

const w = (usedPercent: number) => ({ usedPercent, resetsAt: null });
const limits = (fiveHour: number | null, sevenDay: number | null) => ({
  plan: 'Max',
  fiveHour: fiveHour === null ? null : w(fiveHour),
  sevenDay: sevenDay === null ? null : w(sevenDay),
  updatedAt: 0,
  stale: false,
});

it('shows 5-hour then 7-day usage, a dash for a window that is not known, and warns near a limit', () => {
  expect(quotaText(limits(3.4, 90))).toBe('3·90%');
  expect(quotaText(limits(null, 41.6))).toBe('–·42%');
  expect(quotaNearLimit(limits(3, 90))).toBe(true);
  expect(quotaNearLimit(limits(3, 40))).toBe(false);
  expect(quotaNearLimit(limits(null, null))).toBe(false);
  expect(quotaText(limits(104, null))).toBe('104·–%'); // an overage is shown as it is
});

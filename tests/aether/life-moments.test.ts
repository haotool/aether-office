import { describe, expect, it } from 'vitest';
import type { LifeMoment } from '../../packages/office-scene/src/life/signals.js';
import { MOMENTS_PER_MEMBER, withMoment } from '../../apps/web/src/features/feed/life-moments.js';

const moment = (n: number): LifeMoment => ({
  member: 'm1',
  rule: 'rubber-duck',
  text: `moment ${n}`,
  at: n,
});

describe('the recent moments of a member', () => {
  it('lists the newest first and keeps only the last few', () => {
    let list: LifeMoment[] = [];
    for (let n = 1; n <= MOMENTS_PER_MEMBER + 3; n += 1) list = withMoment(list, moment(n));
    expect(list).toHaveLength(MOMENTS_PER_MEMBER);
    expect(list[0]!.at).toBe(MOMENTS_PER_MEMBER + 3);
    expect(list.at(-1)!.at).toBe(4);
  });

  it('does not change the list it was given', () => {
    const before = [moment(1)];
    withMoment(before, moment(2));
    expect(before).toEqual([moment(1)]);
  });
});

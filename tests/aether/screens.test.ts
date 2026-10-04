import { expect, it } from 'vitest';
import { ROLE_LABELS } from '../../packages/kernel/src/index.js';
import { screenRoles } from '../../packages/office-scene/src/screens.js';
import { seeded } from '../../packages/office-scene/src/random.js';

it('has screen art for every engineering role, and picks it deterministically per member', () => {
  expect([...screenRoles].sort()).toEqual(Object.keys(ROLE_LABELS).sort());
  const a = seeded('member-1');
  const b = seeded('member-1');
  const values = Array.from({ length: 5 }, () => a());
  expect(Array.from({ length: 5 }, () => b())).toEqual(values); // same member, same picture
  expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  expect(seeded('member-2')()).not.toBe(seeded('member-1')());
});

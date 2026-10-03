import { expect, it } from 'vitest';
import { newlyPending } from '../../apps/web/src/notifications.js';

const a = (id: string, state = 'pending') => ({ id, state, kind: 'shell' });

it('records existing approvals silently, then reports only new pending ones', () => {
  const first = newlyPending(null, [a('1'), a('2')]);
  expect(first.fresh).toEqual([]);
  const second = newlyPending(first.seen, [a('1'), a('2'), a('3'), a('4', 'approved')]);
  expect(second.fresh.map((x) => x.id)).toEqual(['3']);
  expect(newlyPending(second.seen, [a('3')]).fresh).toEqual([]); // never twice
});

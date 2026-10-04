import { expect, it } from 'vitest';
import { sessionTransitions } from '../../apps/web/src/notifications.js';

it('reports a session that starts waiting for a human or stops working, never on the first look', () => {
  const s = (key: string, activity: string) => ({ key, activity, title: key });
  const first = sessionTransitions(null, [s('a', 'working'), s('b', 'working'), s('c', 'idle')]);
  expect(first.events).toEqual([]); // opening the page does not flood
  const next = sessionTransitions(first.states, [
    s('a', 'waiting_permission'),
    s('b', 'idle'),
    s('c', 'working'),
    s('d', 'waiting_permission'), // new session: no transition yet
  ]);
  expect(next.events).toEqual([
    { key: 'a', kind: 'needs-you', title: 'a' },
    { key: 'b', kind: 'finished', title: 'b' },
  ]);
  expect(sessionTransitions(next.states, [s('a', 'waiting_permission')]).events).toEqual([]); // no repeat
});

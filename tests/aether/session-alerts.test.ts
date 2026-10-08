import { expect, it } from 'vitest';
import {
  LONG_TURN_MS,
  planAlerts,
  sessionTransitions,
  type SessionEvent,
} from '../../apps/web/src/lib/notifications/alert-rules.js';

const s = (key: string, activity: string) => ({
  key,
  activity,
  project: `repo-${key}`,
  to: `/o/${key}`,
});
const labels = { needsYou: 'needs you', finished: 'finished' };

it('reports a session that starts waiting for a human or stops working, never on the first look', () => {
  const first = sessionTransitions(null, [s('a', 'working'), s('b', 'working'), s('c', 'idle')], 0);
  expect(first.events).toEqual([]); // opening the page does not flood
  const next = sessionTransitions(
    first.states,
    [
      s('a', 'waiting_permission'),
      s('b', 'idle'),
      s('c', 'working'),
      s('d', 'waiting_permission'), // new session: no transition yet
    ],
    90_000,
  );
  expect(next.events).toEqual([
    { key: 'a', kind: 'needs-you', project: 'repo-a', to: '/o/a', turnMs: null },
    { key: 'b', kind: 'finished', project: 'repo-b', to: '/o/b', turnMs: 90_000 },
  ]);
  expect(sessionTransitions(next.states, [s('a', 'waiting_permission')], 95_000).events).toEqual(
    [],
  ); // no repeat
});

it('measures a turn from when the session started working, not from the last look', () => {
  const start = sessionTransitions(null, [s('a', 'idle')], 0);
  const working = sessionTransitions(start.states, [s('a', 'working')], 10_000);
  const still = sessionTransitions(working.states, [s('a', 'working')], 50_000);
  const done = sessionTransitions(still.states, [s('a', 'idle')], 70_000);
  expect(done.events[0]?.turnMs).toBe(60_000);
});

const event = (kind: SessionEvent['kind'], turnMs: number | null): SessionEvent => ({
  key: 'k',
  kind,
  project: 'my-repo',
  to: '/o/k',
  turnMs,
});

it('alerts for a session that needs you always, and for a long turn only while the tab is hidden', () => {
  const context = { notify: true, permission: 'granted' as const };
  const needs = event('needs-you', null);
  const long = event('finished', LONG_TURN_MS);
  const short = event('finished', LONG_TURN_MS - 1);
  expect(planAlerts([needs, long, short], { ...context, hidden: false }, labels)).toHaveLength(1);
  expect(
    planAlerts([needs, long, short], { ...context, hidden: true }, labels).map((d) => d.title),
  ).toEqual(['needs you', 'finished']);
  expect(planAlerts([needs, long], { ...context, notify: false, hidden: true }, labels)).toEqual(
    [],
  );
});

it('says only the project name and opens the session; shows an in-page notice without permission', () => {
  const [granted] = planAlerts(
    [event('needs-you', null)],
    { notify: true, hidden: true, permission: 'granted' },
    labels,
  );
  expect(granted).toEqual({
    tag: 'needs-you:k',
    title: 'needs you',
    body: 'my-repo',
    to: '/o/k',
    via: 'native',
  });
  for (const permission of ['denied', 'default', 'unsupported'] as const)
    expect(
      planAlerts([event('needs-you', null)], { notify: true, hidden: false, permission }, labels)[0]
        ?.via,
    ).toBe('toast');
  const [long] = planAlerts(
    [{ ...event('needs-you', null), project: 'x'.repeat(200) }],
    { notify: true, hidden: false, permission: 'granted' },
    labels,
  );
  expect(long?.body).toHaveLength(60);
});

it('keeps Markdown out of an alert, whatever the project is called', () => {
  const [alert] = planAlerts(
    [{ ...event('needs-you', null), project: '**my** `repo` [x](https://a.test)' }],
    { notify: true, hidden: true, permission: 'granted' },
    labels,
  );
  expect(alert?.body).toBe('my repo x');
});

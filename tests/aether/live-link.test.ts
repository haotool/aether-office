import { expect, it } from 'vitest';
import {
  OFFLINE_AFTER_FAILURES,
  ageText,
  backoffMs,
  initialLink,
  linkReducer,
  parseChange,
  queriesFor,
} from '../../apps/web/src/features/integrations/live-link.js';
import {
  attentionCount,
  attentionKeys,
  type Feed,
} from '../../apps/web/src/features/feed/feed-model.js';

it('maps changes to the queries they make stale, once each', () => {
  const change = (
    key: string,
    ...kinds: ('state' | 'tool' | 'speech' | 'transcript' | 'squad' | 'outcome')[]
  ) => ({
    seq: 1,
    key,
    kinds,
  });
  expect(queriesFor([change('claude:a', 'state')])).toEqual([['local-sessions']]);
  expect(queriesFor([change('claude:a', 'squad', 'outcome')])).toEqual([['local-sessions']]);
  expect(queriesFor([change('claude:a', 'speech')])).toEqual([
    ['speech'],
    ['transcript', 'claude:a'],
  ]);
  expect(
    queriesFor([change('claude:a', 'transcript', 'tool'), change('claude:b', 'transcript')]),
  ).toEqual([
    ['local-sessions'],
    ['transcript', 'claude:a'],
    ['usage'],
    ['transcript', 'claude:b'],
  ]);
  expect(queriesFor([])).toEqual([]);
});

it('ignores an event that is not a change', () => {
  expect(parseChange('{"seq":3,"key":"claude:a","kinds":["tool"]}')).toEqual({
    seq: 3,
    key: 'claude:a',
    kinds: ['tool'],
  });
  expect(parseChange('not json')).toBeNull();
  expect(parseChange('{"seq":"3"}')).toBeNull();
});

it('backs off exponentially with jitter, within a ceiling', () => {
  expect(backoffMs(0, 1)).toBe(1000);
  expect(backoffMs(3, 1)).toBe(8000);
  expect(backoffMs(10, 1)).toBe(30_000);
  expect(backoffMs(3, 0.5)).toBe(4000);
  expect(backoffMs(5, 0)).toBe(250); // never a hot loop
});

it('tracks the link: live on open, reconnecting after a loss, offline after repeated losses or no network', () => {
  const live = linkReducer(initialLink, { type: 'open', at: 100 });
  expect(live).toEqual({ status: 'live', failures: 0, lastAt: 100 });
  expect(linkReducer(live, { type: 'message', at: 200 }).lastAt).toBe(200);
  let state = linkReducer(live, { type: 'lost', online: true });
  expect(state.status).toBe('reconnecting');
  for (let i = 1; i < OFFLINE_AFTER_FAILURES; i++)
    state = linkReducer(state, { type: 'lost', online: true });
  expect(state.status).toBe('offline');
  expect(linkReducer(live, { type: 'lost', online: false }).status).toBe('offline');
  expect(linkReducer(state, { type: 'open', at: 300 })).toEqual({
    status: 'live',
    failures: 0,
    lastAt: 300,
  });
  // a message while not live changes nothing; a reset keeps the time of the last word
  expect(linkReducer(state, { type: 'message', at: 400 })).toBe(state);
  expect(linkReducer(live, { type: 'reset' })).toEqual({ ...initialLink, lastAt: 100 });
});

it('words an age in seconds and minutes in both languages', () => {
  expect(ageText(4200, 'en')).toBe('4s');
  expect(ageText(4200, 'zh-TW')).toBe('4 秒');
  expect(ageText(185_000, 'en')).toBe('3 min');
  expect(ageText(-5, 'en')).toBe('0s');
});

it('counts the same sessions in every badge: waiting ones plus finished ones not yet opened', () => {
  const item = (key: string, unread: boolean) => ({ key, unread }) as never;
  const feed: Feed = {
    needs: [item('a', false), item('b', true)],
    working: [item('w', true)],
    finished: [item('c', true), item('d', false)],
    idle: [],
  };
  expect([...attentionKeys(feed)].sort()).toEqual(['a', 'b', 'c']);
  expect(attentionCount(feed)).toBe(3);
});

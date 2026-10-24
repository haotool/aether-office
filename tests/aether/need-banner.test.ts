import { describe, expect, it } from 'vitest';
import {
  REMIND_EVERY_MS,
  asksOf,
  bannerOf,
  freshAsks,
  reminderDue,
} from '../../apps/web/src/features/shell-chrome/need-banner.js';

const NOW = 10_000_000;
type Session = NonNullable<Parameters<typeof asksOf>[0]>[number];
const label = (s: { key: string }) => `label-${s.key}`;
const session = (key: string, hookAt: number | null, activity = 'waiting_permission') =>
  ({
    key,
    mtime: NOW - 1_000,
    process: 'running',
    hook: hookAt === null ? null : { activity, at: hookAt, tool: 'Bash' },
  }) as unknown as Session;

describe('asksOf', () => {
  it('lists sessions waiting on a person, longest wait first', () => {
    const asks = asksOf(
      [session('a', NOW - 60_000), session('b', NOW - 300_000), session('c', NOW, 'working')],
      new Set(),
      label,
      NOW,
    );
    expect(asks.map((a) => [a.key, a.since, a.detail])).toEqual([
      ['b', NOW - 300_000, 'Bash'],
      ['a', NOW - 60_000, 'Bash'],
    ]);
  });

  it('also lists a session that holds an open permission request', () => {
    const asks = asksOf([session('a', null)], new Set(['a']), label, NOW);
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ key: 'a', label: 'label-a', since: NOW - 1_000, detail: '' });
  });
});

describe('bannerOf', () => {
  const ask = (key: string, since: number, detail = '') => ({ key, label: key, since, detail });

  it('is nothing while nobody asks', () => {
    expect(bannerOf([], NOW, 'en')).toBeNull();
  });

  it('names whoever has waited longest, what for, how long, and how many more', () => {
    const banner = bannerOf(
      [ask('a', NOW - 5 * 60_000, 'Bash'), ask('b', NOW - 60_000)],
      NOW,
      'en',
    );
    expect(banner).toEqual({ key: 'a', label: 'a', detail: 'Bash', waited: '5 min', more: 1 });
  });

  it('says nothing about the wait before the first minute', () => {
    expect(bannerOf([ask('a', NOW - 20_000)], NOW, 'en')?.waited).toBe('');
  });
});

describe('freshAsks', () => {
  const ask = (key: string) => ({ key, label: key, since: NOW, detail: '' });

  it('reports only asks that were not there at the last look', () => {
    expect(freshAsks(new Set(['a']), [ask('a'), ask('b')]).map((a) => a.key)).toEqual(['b']);
    expect(freshAsks(new Set(), [])).toEqual([]);
  });
});

describe('reminderDue', () => {
  const ask = { key: 'a', label: 'a', since: NOW, detail: '' };

  it('rings again only after a whole interval, and only while nobody is attending', () => {
    expect(reminderDue([ask], true, NOW - REMIND_EVERY_MS, NOW)).toBe(true);
    expect(reminderDue([ask], true, NOW - REMIND_EVERY_MS + 1, NOW)).toBe(false);
    expect(reminderDue([ask], false, NOW - 10 * REMIND_EVERY_MS, NOW)).toBe(false);
    expect(reminderDue([], true, NOW - 10 * REMIND_EVERY_MS, NOW)).toBe(false);
  });
});

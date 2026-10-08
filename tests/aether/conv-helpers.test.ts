import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  relativeAgo,
  sameDay,
} from '../../apps/web/src/features/conversation/conv-time.js';
import {
  holdBaseline,
  releaseBaseline,
  seenBaseline,
} from '../../apps/web/src/features/sessions/session-seen.js';
import { matchOffsets } from '../../apps/web/src/features/conversation/conv-find.js';
import { nextKey, type KeyState } from '../../apps/web/src/features/conversation/conv-keys.js';
import { noticeTone, groupNotices } from '../../apps/web/src/features/feed/notice-model.js';
import type { Notice } from '../../packages/kernel/src/index.js';

const NOW = new Date(2026, 9, 7, 15, 30).getTime();
const minutesAgo = (n: number) => NOW - n * 60_000;

describe('conversation time', () => {
  it('says "just now" for the last minute and counts minutes for the next hour', () => {
    expect(relativeAgo(NOW - 20_000, NOW, 'en')).toBe('just now');
    expect(relativeAgo(NOW - 20_000, NOW, 'zh-TW')).toBe('剛剛');
    expect(relativeAgo(minutesAgo(3), NOW, 'en')).toBe('3 min ago');
    expect(relativeAgo(minutesAgo(3), NOW, 'zh-TW')).toBe('3 分鐘前');
    expect(relativeAgo(minutesAgo(59), NOW, 'en')).toBe('59 min ago');
  });
  it('gives no relative label after an hour, and none for a time in the future or unknown', () => {
    expect(relativeAgo(minutesAgo(61), NOW, 'en')).toBeNull();
    expect(relativeAgo(NOW + 5000, NOW, 'en')).toBe('just now');
    expect(relativeAgo(null, NOW, 'en')).toBeNull();
  });
  it('tells days apart in local time', () => {
    expect(sameDay(minutesAgo(10), NOW)).toBe(true);
    expect(sameDay(new Date(2026, 9, 6, 23, 59).getTime(), NOW)).toBe(false);
  });
  it('labels a day as today, yesterday or a date', () => {
    expect(dayLabel(minutesAgo(5), NOW, 'en')).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 6, 12).getTime(), NOW, 'en')).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 6, 12).getTime(), NOW, 'zh-TW')).toBe('昨天');
    expect(dayLabel(new Date(2026, 8, 1, 12).getTime(), NOW, 'en')).toMatch(/Sep/);
  });
});

describe('seen baseline', () => {
  it('keeps the time from before a visit while it lasts, and forgets it after', () => {
    expect(seenBaseline('claude:x')).toBe(0); // nothing stored, nothing held
    holdBaseline('claude:x', 1234);
    expect(seenBaseline('claude:x')).toBe(1234);
    releaseBaseline('claude:x');
    expect(seenBaseline('claude:x')).toBe(0);
  });
});

describe('conversation find', () => {
  it('finds every occurrence, case-insensitively, without overlapping', () => {
    expect(matchOffsets('Foo foo FOO', 'foo')).toEqual([0, 4, 8]);
    expect(matchOffsets('aaaa', 'aa')).toEqual([0, 2]);
  });
  it('finds CJK text and ignores an empty or whitespace query', () => {
    expect(matchOffsets('收斂清理，收斂分支', '收斂')).toEqual([0, 5]);
    expect(matchOffsets('abc', '')).toEqual([]);
    expect(matchOffsets('abc', '  ')).toEqual([]);
  });
  it('is bounded on a hostile text', () => {
    expect(matchOffsets('a'.repeat(200_000), 'a', 500)).toHaveLength(500);
  });
});

describe('conversation keys', () => {
  const idle: KeyState = { pending: null, at: 0 };
  it('moves between turns with j and k', () => {
    expect(nextKey(idle, 'j', 0).action).toBe('next');
    expect(nextKey(idle, 'k', 0).action).toBe('prev');
  });
  it('goes to the top on g g, to the bottom on G, and forgets a lone g', () => {
    const first = nextKey(idle, 'g', 100);
    expect(first.action).toBeNull();
    expect(nextKey(first.state, 'g', 400).action).toBe('top');
    expect(nextKey(first.state, 'g', 5000).action).toBeNull();
    expect(nextKey(idle, 'G', 0).action).toBe('bottom');
    expect(nextKey(first.state, 'j', 200).action).toBe('next');
  });
  it('ignores other keys', () => {
    expect(nextKey(idle, 'x', 0)).toEqual({ action: null, state: idle });
  });
});

describe('notice model', () => {
  const task = (over: Partial<Extract<Notice, { kind: 'task' }>>): Notice => ({
    kind: 'task',
    status: 'completed',
    summary: 's',
    exitCode: 0,
    detail: '',
    ...over,
  });
  it('colors a task by its real status and exit code only', () => {
    expect(noticeTone(task({}))).toBe('ok');
    expect(noticeTone(task({ exitCode: 2 }))).toBe('failed');
    expect(noticeTone(task({ status: 'failed', exitCode: null }))).toBe('failed');
    expect(noticeTone(task({ status: 'killed', exitCode: null }))).toBe('failed');
    expect(noticeTone(task({ status: 'running', exitCode: null }))).toBe('neutral');
    expect(noticeTone(task({ status: null, exitCode: null }))).toBe('neutral');
    expect(noticeTone({ kind: 'output', text: 'x', error: true })).toBe('failed');
    expect(noticeTone({ kind: 'command', name: '/x', args: '' })).toBe('neutral');
  });
  it('merges the context notices of a run into one entry placed first, keeping the others in order', () => {
    const notices: Notice[] = [
      { kind: 'context', label: 'system', text: 'a' },
      task({}),
      { kind: 'context', label: 'ide', text: 'b' },
      { kind: 'hook', text: 'h' },
    ];
    const groups = groupNotices(notices);
    expect(groups.map((g) => g.kind)).toEqual(['contexts', 'task', 'hook']);
    expect(groups[0]).toMatchObject({ kind: 'contexts', items: [{ text: 'a' }, { text: 'b' }] });
  });
  it('has no groups for no notices', () => {
    expect(groupNotices([])).toEqual([]);
  });
});

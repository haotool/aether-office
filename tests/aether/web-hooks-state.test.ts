import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { installBrowserEnv, removeBrowserEnv, type BrowserEnv } from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';
import type { Turn } from '../../apps/web/src/features/conversation/turn-groups.js';

// Product hooks on a synthetic hook runtime (fixtures/mini-react.ts): the repo's vitest has no DOM environment.
// phone.ts reads window.matchMedia as it loads, so the browser exists before the modules do and lasts for the file.
const env: BrowserEnv = installBrowserEnv();
const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));

const { useCompactions } =
  await import('../../apps/web/src/features/conversation/use-compactions.js');
const { firstUnreadId, blockId, promptId, turnIds, useFreshIds } =
  await import('../../apps/web/src/features/conversation/use-fresh-ids.js');
const { useSeats } = await import('../../apps/web/src/features/office/use-seats.js');
const { useConvDensity } =
  await import('../../apps/web/src/features/conversation/use-conv-density.js');
const { usePhone, usePhoneAny } = await import('../../apps/web/src/lib/preferences/phone.js');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000_000);
  env.storage.clear();
});
afterEach(() => vi.useRealTimers());
afterAll(removeBrowserEnv);

describe('useCompactions', () => {
  const reading = (used: number, compactedAt: number | null = null) => ({
    used,
    window: 200_000,
    compactedAt,
  });

  it('shows a context drop for three seconds and then lets it go', () => {
    const hook = renderHook(useCompactions, { a: reading(150_000) });
    expect(hook.current).toEqual({});
    hook.rerender({ a: reading(30_000) });
    expect(hook.current['a']).toMatchObject({ kind: 'drop', fromPct: 75, toPct: 15 });
    vi.advanceTimersByTime(2_999);
    expect(hook.current['a']).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(hook.current).toEqual({});
  });

  it('keeps a newer compaction when an older one expires', () => {
    const hook = renderHook(useCompactions, { a: reading(150_000) });
    hook.rerender({ a: reading(30_000) });
    const first = hook.current['a']!.key;
    vi.advanceTimersByTime(2_000);
    hook.rerender({ a: reading(30_000, Date.now() - 1_000) }); // the CLI's own marker, a new detection
    const second = hook.current['a']!.key;
    expect(second).not.toBe(first);
    vi.advanceTimersByTime(1_500); // the first timer is due now, the second is not
    expect(hook.current['a']?.key).toBe(second);
  });

  it('forgets a member that left, so it starts fresh when it returns', () => {
    const hook = renderHook(useCompactions, { a: reading(150_000) } as Record<
      string,
      ReturnType<typeof reading>
    >);
    hook.rerender({});
    hook.rerender({ a: reading(30_000) }); // first sight again: no earlier reading to fall from
    expect(hook.current).toEqual({});
  });

  it('cancels its timers on unmount', () => {
    const hook = renderHook(useCompactions, { a: reading(150_000) });
    hook.rerender({ a: reading(30_000) });
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fresh ids', () => {
  const turn = (id: string, blocks: number, at: number | null, user = true): Turn =>
    ({
      id,
      user: user ? { text: 'hi', at } : null,
      blocks: Array.from({ length: blocks }, (_, i) => ({ at: at === null ? null : at + i + 1 })),
    }) as unknown as Turn;

  it('names what a turn draws and skips the prompt of a turn that has none', () => {
    expect(turnIds(turn('t1', 2, 1))).toEqual(['t1:prompt', 't1:0', 't1:1']);
    expect(turnIds(turn('head', 1, 1, false))).toEqual(['head:0']);
    expect(promptId(turn('t1', 0, 1))).toBe('t1:prompt');
    expect(blockId(turn('t1', 0, 1), 3)).toBe('t1:3');
  });

  it('treats what was there at the first look as history and what arrives later as fresh', () => {
    const hook = renderHook(useFreshIds, 's1', null as readonly string[] | null);
    expect(hook.current('a')).toBe(false); // nothing loaded yet is not a first look
    hook.rerender('s1', ['a', 'b']);
    expect(hook.current('a')).toBe(false);
    hook.rerender('s1', ['a', 'b', 'c']);
    expect(hook.current('c')).toBe(true);
    hook.rerender('s1', ['a', 'b', 'c', 'd']);
    expect(hook.current('c')).toBe(true); // stays fresh while on screen
    hook.rerender('other', ['a', 'b', 'c', 'd']); // another session: all of it is history again
    expect(hook.current('c')).toBe(false);
  });

  it('finds the first thing after the last look, but not when it is the very first thing shown', () => {
    const turns = [turn('t1', 1, 100), turn('t2', 1, 200)];
    expect(firstUnreadId(turns, 0)).toBeNull();
    expect(firstUnreadId(turns, 150)).toBe('t2:prompt');
    expect(firstUnreadId(turns, 50)).toBeNull(); // everything is newer: nothing older to divide it from
    expect(firstUnreadId(turns, 500)).toBeNull();
  });
});

describe('useSeats', () => {
  const agent = (id: string) => ({ id }) as Agent;
  const KEY = 'aether-seats:p1';

  it('keeps each desk while a member stays and remembers them per project', () => {
    const hook = renderHook(useSeats, 'p1', [agent('a'), agent('b')], () => 0);
    const seatOfA = hook.current.get('a');
    expect(seatOfA).toBeDefined();
    expect(hook.current.get('b')).not.toEqual(seatOfA);
    hook.rerender('p1', [agent('b'), agent('a'), agent('c')], () => 0);
    expect(hook.current.get('a')).toEqual(seatOfA);
    const saved = JSON.parse(env.storage.getItem(KEY)!) as { v: number; seats: unknown[][] };
    expect(saved.seats.map((row) => row[0])).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('seats the same people where they sat after a reload', () => {
    const first = renderHook(useSeats, 'p1', [agent('a'), agent('b')], () => 0);
    const seats = new Map(first.current);
    first.unmount();
    const again = renderHook(useSeats, 'p1', [agent('b'), agent('a')], () => 0);
    expect(again.current.get('a')).toEqual(seats.get('a'));
    expect(again.current.get('b')).toEqual(seats.get('b'));
  });

  it('keeps the remembered desks while nothing is loaded yet, and does not save an empty office', () => {
    env.storage.setItem(KEY, JSON.stringify({ v: 1, seats: [['a', 0, 2]] }));
    const hook = renderHook(useSeats, 'p1', [] as Agent[], () => 0);
    expect(hook.current.get('a')).toEqual([0, 2]);
    expect(env.storage.getItem(KEY)).toContain('"a"');
    env.storage.setItem(KEY, 'untouched');
    hook.rerender('p1', [], () => 0);
    expect(env.storage.getItem(KEY)).toBe('untouched');
  });

  it('keeps projects apart', () => {
    env.storage.setItem(KEY, JSON.stringify({ v: 1, seats: [['a', 0, 2]] }));
    const other = renderHook(useSeats, 'p2', [agent('a')], () => 0);
    expect(other.current.get('a')).toEqual([0, 0]);
  });
});

describe('useConvDensity', () => {
  it('starts comfortable, toggles, and remembers the choice in this browser', () => {
    const hook = renderHook(useConvDensity);
    expect(hook.current[0]).toBe('comfortable');
    hook.current[1]();
    expect(hook.current[0]).toBe('compact');
    expect(env.storage.getItem('aether.convDensity')).toBe('compact');
    expect(renderHook(useConvDensity).current[0]).toBe('compact');
    hook.current[1]();
    expect(hook.current[0]).toBe('comfortable');
  });

  it('still works when storage refuses writes', () => {
    const refuse = vi.spyOn(env.storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const hook = renderHook(useConvDensity);
    hook.current[1]();
    expect(hook.current[0]).toBe('compact');
    refuse.mockRestore();
  });
});

describe('usePhone', () => {
  const PORTRAIT = '(max-width: 760px) and (min-height: 501px)';
  const ANY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

  it('follows the phone media queries as the window rotates or resizes', () => {
    const portrait = renderHook(usePhone);
    const any = renderHook(usePhoneAny);
    expect(portrait.current).toBe(false);
    env.media.get(ANY)!.set(true); // a phone on its side: the phone layout without the tab bar
    expect(any.current).toBe(true);
    expect(portrait.current).toBe(false);
    env.media.get(PORTRAIT)!.set(true);
    expect(portrait.current).toBe(true);
  });
});

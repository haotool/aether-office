import { describe, expect, it } from 'vitest';
import {
  MAX_FEEDS,
  chooseFeeds,
  feedCapacity,
} from '../../packages/office-scene/src/multi-view.js';
import { chooseShot, pacedSeconds } from '../../packages/office-scene/src/director.js';
import type { Agent } from '../../packages/contracts/src/index.js';

const agent = (id: string, activity: Agent['activity']) =>
  ({ id, name: id, activity }) as unknown as Agent;
const seats = new Map(
  ['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, { x: i * 4, z: 0, floor: 0, rotation: 0 }]),
);
const agents = [
  agent('a', 'working'),
  agent('b', 'working'),
  agent('c', 'reviewing'),
  agent('d', 'working'),
  agent('e', 'idle'),
];

describe('picture-in-picture feeds', () => {
  it('shows the busiest members the main shot is not on, and never the idle', () => {
    const intensity = new Map([
      ['d', 3],
      ['b', 1],
    ]);
    const feeds = chooseFeeds({ agents, seats, intensity, taken: new Set(['a']), previous: [] });
    expect(feeds.map((f) => f.id)).toEqual(['d', 'b', 'c']);
    expect(feeds[0]!.shot).toMatchObject({ kind: 'closeup', subjects: ['d'] });
  });

  it('keeps every view in its slot when one is dropped: a newcomer takes the vacated slot', () => {
    const first = chooseFeeds({
      agents,
      seats,
      intensity: new Map(),
      taken: new Set(),
      previous: [],
      max: 3,
    });
    expect(first.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    // The main shot moves to `a`: `d` takes its slot and `b`, `c` neither move nor reorder (a frame that moves in the
    // page restarts its power-on dip, which blacks it out).
    const later = chooseFeeds({
      agents,
      seats,
      intensity: new Map(),
      taken: new Set(['a']),
      previous: first,
      max: 3,
    });
    expect(later.map((f) => f.id)).toEqual(['d', 'b', 'c']);
  });

  it('keeps a view that is still busy, and wants at least two busy members to bother', () => {
    const first = chooseFeeds({
      agents,
      seats,
      intensity: new Map(),
      taken: new Set(),
      previous: [],
      max: 2,
    });
    const later = chooseFeeds({
      agents,
      seats,
      intensity: new Map([['d', 3]]),
      taken: new Set(),
      previous: first,
      max: 2,
    });
    expect(later.map((f) => f.id)).toEqual(first.map((f) => f.id)); // d is hotter but the wall does not reshuffle
    expect(
      chooseFeeds({
        agents: [agent('a', 'working')],
        seats,
        intensity: new Map(),
        taken: new Set(),
        previous: [],
      }),
    ).toEqual([]);
  });
});

describe('the wall on the canvas', () => {
  it('shows no view of a member on a floor the scene is not drawing', () => {
    const floors = new Map(seats);
    floors.set('b', { x: 4, z: 0, floor: 1, rotation: 0 });
    const onFloor = (floor?: number) =>
      chooseFeeds({
        agents,
        seats: floors,
        intensity: new Map(),
        taken: new Set(['a']),
        previous: [],
        ...(floor === undefined ? {} : { floor }),
      }).map((f) => f.id);
    expect(onFloor(0)).toEqual(['c', 'd']);
    expect(onFloor(1)).toEqual(['b']);
    expect(onFloor()).toEqual(['b', 'c', 'd']); // the building spread apart draws every floor
  });

  it('fits as many views as the canvas has room for, up to four, and none on a narrow one', () => {
    expect(feedCapacity(300, 700)).toBe(0);
    expect(feedCapacity(560, 700)).toBeLessThan(feedCapacity(750, 700));
    expect(feedCapacity(910, 553)).toBe(MAX_FEEDS);
    expect(feedCapacity(4000, 900)).toBe(MAX_FEEDS);
    expect(feedCapacity(750, 453)).toBe(0); // too short: the wall would cover the floor switcher
    expect(
      chooseFeeds({ agents, seats, intensity: new Map(), taken: new Set(), previous: [] }),
    ).toHaveLength(4);
  });
});

describe('the director with many busy members', () => {
  it('cuts faster the more members are busy, but never below 70%', () => {
    expect(pacedSeconds(6, [agent('a', 'working')])).toBe(6);
    expect(pacedSeconds(6, agents)).toBe(4.9); // four busy
    expect(
      pacedSeconds(
        6,
        Array.from({ length: 12 }, (_, i) => agent(String(i), 'working')),
      ),
    ).toBe(4.2);
  });

  it('gives the hardest worker more screen time', () => {
    const shot = (hot: string) =>
      chooseShot({
        agents: [agent('a', 'working'), agent('b', 'working')],
        seats,
        pulses: [],
        intensity: new Map([[hot, 3]]),
        now: 0,
        shown: new Map(),
        previous: null,
      });
    expect(shot('a')!.subjects).toEqual(['a']);
    expect(shot('b')!.subjects).toEqual(['b']);
  });

  describe('members pinned to the wall by the person', () => {
    const none = { intensity: new Map<string, number>(), previous: [] };
    it('always get a view, busy or not, even alone and even when the main camera is on them', () => {
      const feeds = chooseFeeds({
        agents: [agent('e', 'idle'), agent('f', 'idle')],
        seats,
        ...none,
        taken: new Set(['e']),
        pinned: new Set(['e']),
      });
      expect(feeds.map((f) => f.id)).toEqual(['e']); // idle, a single view, and the member is the main shot
    });

    it('come before the busy ones and take their places when the wall is short', () => {
      const feeds = chooseFeeds({
        agents,
        seats,
        ...none,
        taken: new Set(),
        pinned: new Set(['e']),
        max: 2,
      });
      expect(feeds.map((f) => f.id)).toEqual(['e', 'a']);
    });

    it('are left out when their floor is not drawn', () => {
      const upstairs = new Map(seats).set('e', { x: 0, z: 0, floor: 2, rotation: 0 });
      const feeds = chooseFeeds({
        agents,
        seats: upstairs,
        ...none,
        taken: new Set(),
        pinned: new Set(['e']),
        floor: 0,
      });
      expect(feeds.map((f) => f.id)).not.toContain('e');
    });

    it('get nothing when the canvas has no room for a wall', () => {
      expect(
        chooseFeeds({ agents, seats, ...none, taken: new Set(), pinned: new Set(['e']), max: 0 }),
      ).toEqual([]);
    });
  });
});

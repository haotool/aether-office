import { describe, expect, it } from 'vitest';
import { chooseFeeds } from '../../packages/office-scene/src/multi-view.js';
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

describe('the director with many busy members', () => {
  it('cuts faster the more members are busy, but never below a little over half', () => {
    expect(pacedSeconds(6, [agent('a', 'working')])).toBe(6);
    expect(pacedSeconds(6, agents)).toBe(4.2); // four busy
    expect(
      pacedSeconds(
        6,
        Array.from({ length: 12 }, (_, i) => agent(String(i), 'working')),
      ),
    ).toBe(3.3);
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
});

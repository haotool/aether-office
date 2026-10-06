import { expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import type { Pulse, Seat } from '../../packages/office-scene/src/director.js';
import {
  ENVELOPE_MS,
  MAX_TURN,
  distanceFade,
  engagement,
  engagementsOf,
  envelopeProgress,
  nodPitch,
  relationEdges,
  sceneRelations,
  threadPeers,
  turnToward,
  wrapAngle,
} from '../../packages/office-scene/src/interplay.js';

const seat = (x: number, z: number, rotation = 0, floor = 0): Seat => ({ x, z, floor, rotation });

it('wraps angles into half a turn either way', () => {
  expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
  expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
});

it('turns a member toward its partner, signed by side, clamped to a glance', () => {
  // A desk with rotation 0 faces -z. A partner straight ahead needs no turn.
  expect(turnToward(seat(0, 0), seat(0, -5))).toBeCloseTo(0);
  // A partner a little to the +x side (still ahead) is a turn to the right of the forward axis.
  const slight = turnToward(seat(0, 0), seat(1, -5));
  expect(slight).toBeLessThan(0);
  expect(Math.abs(slight)).toBeLessThan(MAX_TURN);
  expect(turnToward(seat(0, 0), seat(-1, -5))).toBeCloseTo(-slight);
  // Behind the member it cannot swivel past the clamp.
  expect(turnToward(seat(0, 0), seat(5, 0))).toBeCloseTo(-MAX_TURN);
  expect(turnToward(seat(0, 0), seat(-5, 0))).toBeCloseTo(MAX_TURN);
});

it('accounts for the way the desk is turned', () => {
  // Rotation 1 (a quarter turn) faces -x: a partner straight along -x is dead ahead.
  expect(turnToward(seat(0, 0, 1), seat(-6, 0))).toBeCloseTo(0);
});

it('eases the turn in and out, and travels the envelope from 0 to 1 before the nod', () => {
  expect(engagement(-1)).toBe(0);
  expect(engagement(200)).toBeCloseTo(0.5);
  expect(engagement(3000)).toBe(1);
  expect(engagement(9600)).toBeCloseTo(0.5);
  expect(engagement(20_000)).toBe(0);
  expect(envelopeProgress(0)).toBe(0);
  expect(envelopeProgress(ENVELOPE_MS / 2)).toBeCloseTo(0.5);
  expect(envelopeProgress(ENVELOPE_MS * 3)).toBe(1);
  expect(nodPitch(ENVELOPE_MS - 100)).toBe(0); // not before it lands
  expect(
    Math.max(...Array.from({ length: 70 }, (_, i) => nodPitch(ENVELOPE_MS + i * 10))),
  ).toBeGreaterThan(0.02);
  expect(nodPitch(ENVELOPE_MS + 2000)).toBe(0);
});

const seats = new Map<string, Seat>([
  ['a', seat(0, 0)],
  ['b', seat(4, 0)],
  ['c', seat(8, 0)],
  ['up', seat(0, 0, 0, 1)],
]);
const pulse = (from: string, to: string, kind: Pulse['kind'], at: number): Pulse => ({
  id: `${from}${to}${at}`,
  from,
  to,
  kind,
  at,
});

it('turns both ends of a message, but only the subagent toward its parent, and never across floors', () => {
  const map = engagementsOf(
    [pulse('a', 'b', 'inform', 5), pulse('a', 'c', 'sub', 4), pulse('a', 'up', 'request', 3)],
    seats,
    () => true,
  );
  expect(map.get('b')?.[0]).toMatchObject({ at: 5, receives: true });
  expect(map.get('a')?.map((e) => e.at)).toEqual([5]); // not for the sub pulse, not for the other floor
  expect(map.get('c')?.[0]).toMatchObject({ receives: false });
  expect(map.has('up')).toBe(false);
});

it('finds the members that share a thread, nearest first, on the same floor only', () => {
  const groups = new Map([
    ['a', 'repo'],
    ['b', 'repo'],
    ['c', 'repo'],
    ['up', 'repo'],
  ]);
  expect(threadPeers('a', groups, seats)).toEqual(['b', 'c']);
  expect(threadPeers('a', groups, seats, 1)).toEqual(['b']);
  expect(
    threadPeers(
      'a',
      new Map([
        ['a', 'x'],
        ['b', 'y'],
      ]),
      seats,
    ),
  ).toEqual([]);
});

it('draws a thread only for the focused member and a tether for every parent and child on a drawn floor', () => {
  const base = {
    groupOf: new Map([
      ['a', 'repo'],
      ['b', 'repo'],
    ]),
    tethers: [{ parent: 'a', child: 'c' }],
    seats,
    heightOf: () => 0,
    visible: (floor: number) => floor === 0,
  };
  expect(relationEdges({ ...base, focus: null }).map((e) => e.kind)).toEqual(['tether']);
  expect(relationEdges({ ...base, focus: 'a' }).map((e) => e.kind)).toEqual(['tether', 'thread']);
  expect(relationEdges({ ...base, focus: 'a' })[0]!.strength).toBe(1);
  expect(relationEdges({ ...base, focus: null })[0]!.strength).toBeLessThan(1);
  expect(relationEdges({ ...base, tethers: [{ parent: 'a', child: 'up' }], focus: null })).toEqual(
    [],
  );
});

it('fades lines out with distance', () => {
  expect(distanceFade(10)).toBe(1);
  expect(distanceFade(70)).toBeCloseTo(0.5);
  expect(distanceFade(200)).toBe(0);
});

it('groups members by repository (else branch) and counts only messages inside the live window', () => {
  const agents = ['a', 'b', 'c'].map((id) => ({ id }) as Agent);
  const info = (repo: string | null, branch: string | null) => ({
    repo,
    branch,
    linked: false,
    dirty: 0,
    ahead: 0,
    behind: 0,
  });
  const branchOf = (agent: Agent) =>
    agent.id === 'c' ? info(null, 'feat/x') : info('aether', 'main');
  const relations = (now: number) =>
    sceneRelations({
      pulses: [pulse('a', 'b', 'inform', 1000)],
      seats,
      agents,
      branchOf,
      tethers: [],
      focus: 'a',
      heightOf: () => 0,
      visible: () => true,
      now,
    });
  expect(relations(2000).edges.map((e) => e.kind)).toEqual(['thread']); // b shares the repo, c does not
  expect(relations(2000).engagements.has('b')).toBe(true);
  expect(relations(60_000).engagements.has('b')).toBe(false); // the message is long gone
});

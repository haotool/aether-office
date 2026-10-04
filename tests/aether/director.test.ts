import { expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import {
  PULSE_WINDOW_MS,
  chooseShot,
  type Pulse,
  type Seat,
} from '../../packages/office-scene/src/director.js';
import { poseAt } from '../../packages/office-scene/src/shot-camera.js';

const agent = (id: string, activity: Agent['activity']) => ({ id, activity }) as Agent;
const seats = new Map<string, Seat>([
  ['a', { x: -6, z: 4, floor: 0, rotation: 0 }],
  ['b', { x: -2, z: 4, floor: 0, rotation: 0 }],
  ['c', { x: 8, z: -6, floor: 1, rotation: 1 }],
]);
const NOW = 1_000_000;
const none = new Map<string, number>();
const choose = (
  agents: Agent[],
  extra: { pulses?: Pulse[]; shown?: Map<string, number>; previous?: null } = {},
) =>
  chooseShot({
    agents,
    seats,
    pulses: extra.pulses ?? [],
    now: NOW,
    shown: extra.shown ?? none,
    previous: extra.previous ?? null,
  });
const pulse = (age: number, kind: Pulse['kind'] = 'request'): Pulse => ({
  id: 'm1',
  from: 'a',
  to: 'b',
  kind,
  at: NOW - age,
});

it('cuts to a two-shot when one agent has just written to another, ahead of anyone merely working', () => {
  const shot = choose([agent('a', 'idle'), agent('b', 'working'), agent('c', 'working')], {
    pulses: [pulse(2000)],
  });
  expect(shot).toMatchObject({ kind: 'pair', subjects: ['a', 'b'], reason: 'message', floor: 0 });
});

it('ignores an exchange that is over, and one between agents it cannot place', () => {
  const agents = [agent('a', 'idle'), agent('b', 'idle')];
  expect(choose(agents, { pulses: [pulse(PULSE_WINDOW_MS + 1)] })?.kind).toBe('sweep');
  expect(choose(agents, { pulses: [{ ...pulse(1000), to: 'ghost' }] })?.kind).toBe('sweep');
});

it('puts someone waiting on a human first, then error, then work', () => {
  const pick = (a: Agent['activity']) =>
    choose([agent('a', a), agent('c', 'working')])?.subjects[0];
  expect(pick('waiting_permission')).toBe('a');
  expect(pick('error')).toBe('a');
  expect(pick('working')).toBeDefined();
});

it('shows every active agent in turn, whoever has been off screen longest first', () => {
  const agents = [agent('a', 'working'), agent('b', 'working'), agent('c', 'working')];
  const shown = new Map([
    ['a', NOW - 3000], // just seen: held back
    ['b', NOW - 40_000],
    ['c', NOW - 20_000],
  ]);
  expect(choose(agents, { shown })?.subjects[0]).toBe('b');
});

it('sweeps the busiest floor, a different one next time, when nothing is going on', () => {
  const agents = [agent('a', 'idle'), agent('b', 'idle'), agent('c', 'idle')];
  const first = choose(agents)!;
  expect(first).toMatchObject({ kind: 'sweep', floor: 0, subjects: [] });
  const second = choose(agents, { previous: first as never });
  expect(second?.floor).toBe(1);
  expect(choose([], {})).toMatchObject({ kind: 'sweep' }); // seats alone are enough to sweep
  expect(
    chooseShot({ agents: [], seats: new Map(), pulses: [], now: NOW, shown: none, previous: null }),
  ).toBeNull();
});

it('a cross-floor message is shown from the sender, not as a two-shot', () => {
  const shot = choose([agent('a', 'idle'), agent('c', 'idle')], {
    pulses: [{ ...pulse(1000), to: 'c' }],
  });
  expect(shot).toMatchObject({ kind: 'closeup', subjects: ['a'], reason: 'message' });
});

it('moves the camera through a closeup, ending nearer to the desk than it began, on the right side of a turned desk', () => {
  const shot = choose([agent('c', 'working')])!;
  const start = poseAt(shot, seats, 0, 0.6);
  const end = poseAt(shot, seats, 1, 0.6);
  const desk = seats.get('c')!;
  const dist = (p: [number, number, number]) => Math.hypot(p[0] - desk.x, p[2] - desk.z);
  expect(dist(end.position)).toBeLessThan(dist(start.position));
  expect(end.fov).toBeLessThan(start.fov);
  // The desk is turned a quarter: the same shot on an unturned desk sits on a different axis.
  const turned = poseAt(shot, new Map([['c', { ...desk, rotation: 0 }]]), 1, 0.6);
  expect(turned.position[0]).not.toBeCloseTo(end.position[0], 1);
  expect(end.position.every(Number.isFinite)).toBe(true);
});

it('frames a pair from beside the line between them and keeps both in front of the lens', () => {
  const shot = choose([agent('a', 'idle'), agent('b', 'idle')], { pulses: [pulse(500)] })!;
  const pose = poseAt(shot, seats, 0.5, 1.6);
  expect(pose.target[0]).toBeCloseTo(-4, 0); // midway between the desks
  expect(Math.abs(pose.position[2] - pose.target[2])).toBeGreaterThan(3); // off to the side, not between them
});

it('looks in on a forgotten or ownerless member between the busy ones, but never ahead of real work', () => {
  const attention = new Map([['a', '休眠 27 小時']]);
  const idleOnly = chooseShot({
    agents: [agent('a', 'idle'), agent('b', 'idle')],
    seats,
    pulses: [],
    attention,
    now: NOW,
    shown: none,
    previous: null,
  });
  expect(idleOnly).toMatchObject({ kind: 'closeup', reason: 'attention', subjects: ['a'] });
  const busy = chooseShot({
    agents: [agent('a', 'idle'), agent('b', 'working')],
    seats,
    pulses: [],
    attention,
    now: NOW,
    shown: none,
    previous: null,
  });
  expect(busy).toMatchObject({ reason: 'working', subjects: ['b'] });
});

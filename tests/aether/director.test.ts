import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import {
  COOLDOWN_MS,
  PULSE_WINDOW_MS,
  chooseShot,
  type Pulse,
  type Seat,
  type Shot,
} from '../../packages/office-scene/src/environment/director.js';
import {
  FLY_MAX,
  MAX_TRAVEL,
  MIN_DISTANCE,
  chooseEntry,
  poseAt,
  type V3,
} from '../../packages/office-scene/src/core/shot-camera.js';

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
    ['a', NOW - 3000],
    ['b', NOW - 40_000],
    ['c', NOW - 20_000],
  ]);
  expect(choose(agents, { shown })?.subjects[0]).toBe('b');
});

it('sweeps the busiest floor, a different one next time, when nothing is going on', () => {
  const agents = [agent('a', 'idle'), agent('b', 'idle'), agent('c', 'idle')];
  const first = choose(agents)!;
  expect(first).toMatchObject({ kind: 'sweep', floor: 0, subjects: ['a', 'b'] });
  const second = choose(agents, { previous: first as never });
  expect(second?.floor).toBe(1);
  expect(choose([], {})).toBeNull();
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
  expect(end.fov).toBe(start.fov);
  const turned = poseAt(shot, new Map([['c', { ...desk, rotation: 0 }]]), 1, 0.6);
  expect(turned.position[0]).not.toBeCloseTo(end.position[0], 1);
  expect(end.position.every(Number.isFinite)).toBe(true);
});

it('frames a pair from beside the line between them and keeps both in front of the lens', () => {
  const shot = choose([agent('a', 'idle'), agent('b', 'idle')], { pulses: [pulse(500)] })!;
  const pose = poseAt(shot, seats, 0.5, 1.6);
  expect(pose.target[0]).toBeCloseTo(-4, 0);
  expect(Math.abs(pose.position[2] - pose.target[2])).toBeGreaterThan(3);
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

describe('a comfortable director', () => {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a: V3) => Math.hypot(...a);
  const angle = (a: V3, b: V3) =>
    Math.acos(Math.min(1, dot(a, b) / (len(a) * len(b)))) * (180 / Math.PI);
  const shot = (kind: Shot['kind'], subjects: string[], style: 0 | 1 | 2, floor = 0): Shot => ({
    key: subjects.join('>') || `floor:${floor}`,
    kind,
    floor,
    subjects,
    reason: 'working',
    seconds: 8,
    score: 50,
    style,
  });
  const shots = ([0, 1, 2] as const).flatMap((style) => [
    shot('closeup', ['a'], style),
    shot('closeup', ['c'], style, 1),
    shot('pair', ['a', 'b'], style),
    shot('pair', ['b', 'a'], style),
    shot('sweep', [], style),
  ]);
  const wide = new Map(seats).set('b', { x: 40, z: -30, floor: 0, rotation: 2 });

  it('moves the camera a short way along one axis: no orbit, no turn, no zoom, a level horizon', () => {
    for (const map of [seats, wide])
      for (const s of shots) {
        const start = poseAt(s, map, 0, 1.6);
        const end = poseAt(s, map, 1, 1.6);
        expect(len(sub(end.position, start.position))).toBeLessThanOrEqual(MAX_TRAVEL + 1e-9);
        expect(
          angle(sub(start.target, start.position), sub(end.target, end.position)),
        ).toBeLessThan(1);
        expect(end.fov).toBe(start.fov);
        const mid = poseAt(s, map, 0.5, 1.6).position;
        const line = sub(end.position, start.position);
        const part = sub(mid, start.position);
        expect(len(line) < 1e-9 || angle(line, part) < 0.01 || len(part) < 1e-9).toBe(true);
      }
  });

  it("stays outside the controls' nearest distance, which would otherwise hold the camera still instead of moving it", () => {
    for (const aspect of [0.5, 1.6, 2.4])
      for (const s of shots)
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const at = poseAt(s, seats, t, aspect);
          expect(len(sub(at.position, at.target))).toBeGreaterThanOrEqual(MIN_DISTANCE - 1e-9);
        }
  });

  it('holds perfectly still once the move is done', () => {
    for (const s of shots) expect(poseAt(s, seats, 1.5, 1.6)).toEqual(poseAt(s, seats, 1, 1.6));
  });

  it('never reverses: every move goes the same way on the screen', () => {
    const along = (s: Shot, map: ReadonlyMap<string, Seat>) => {
      const start = poseAt(s, map, 0, 1.6);
      const end = poseAt(s, map, 1, 1.6);
      const view = sub(start.target, start.position);
      const move = sub(end.position, start.position);
      const right: V3 = [-view[2], 0, view[0]];
      return { forward: dot(move, view) / len(view), right: dot(move, right) / len(right) };
    };
    for (const s of shots.filter((x) => x.kind !== 'pair'))
      expect(along(s, seats).forward).toBeGreaterThan(0);
    const sides = shots
      .filter((x) => x.kind === 'pair')
      .flatMap((s) => [along(s, seats).right, along(s, wide).right]);
    expect(sides.every((v) => v > 0) || sides.every((v) => v < 0)).toBe(true);
  });

  it('keeps a pair on the same side of the line whoever wrote to whom (the 180 degree rule)', () => {
    for (const style of [0, 1, 2] as const) {
      const forward = poseAt(shot('pair', ['a', 'b'], style), seats, 0.5, 1.6);
      const back = poseAt(shot('pair', ['b', 'a'], style), seats, 0.5, 1.6);
      expect(back.position[0]).toBeCloseTo(forward.position[0], 6);
      expect(back.position[2]).toBeCloseTo(forward.position[2], 6);
    }
  });

  it('follows the floor when the building is spread apart', () => {
    const tight = poseAt(shot('closeup', ['c'], 0, 1), seats, 0.5, 1.6);
    const apart = poseAt(shot('closeup', ['c'], 0, 1), seats, 0.5, 1.6, true);
    expect(apart.position[1]).toBeGreaterThan(tight.position[1]);
    expect(apart.target[1]).toBeGreaterThan(tight.target[1]);
  });

  it('glides only between near shots on one floor, and cuts otherwise', () => {
    const a = shot('closeup', ['a'], 0);
    const b = shot('closeup', ['b'], 0);
    expect(chooseEntry(null, a, seats, 1.6)).toBe('cut');
    expect(chooseEntry(a, b, seats, 1.6)).toBe('fly');
    expect(chooseEntry(a, shot('closeup', ['c'], 0, 1), seats, 1.6)).toBe('cut');
    expect(chooseEntry(a, b, wide, 1.6)).toBe('cut');
    const ended = poseAt(a, seats, 1, 1.6).position;
    expect(len(sub(poseAt(a, seats, 0, 1.6).position, ended))).toBeLessThanOrEqual(FLY_MAX);
    expect(chooseEntry(a, a, seats, 1.6)).toBe('cut');
  });

  it('holds a shot long enough to take in, and does not return to the same member within the cooldown', () => {
    const agents = [agent('a', 'working'), agent('b', 'working')];
    const at = (ago: number) =>
      new Map([
        ['a', NOW - ago],
        ['b', NOW - ago],
      ]);
    const first = choose(agents, { shown: new Map([['b', NOW - 40_000]]) })!;
    expect(first.seconds).toBeGreaterThanOrEqual(5);
    expect(first.subjects[0]).toBe('a');
    expect(choose(agents, { shown: at(COOLDOWN_MS - 1000) })).toMatchObject({ kind: 'sweep' });
    expect(choose(agents, { shown: at(COOLDOWN_MS + 1000) })).toMatchObject({ kind: 'closeup' });
    expect(
      choose(agents, { pulses: [pulse(500)], shown: new Map([['a', NOW - 20_000]]) }),
    ).toMatchObject({
      kind: 'closeup',
      subjects: ['b'],
    });
    const urgent = [agent('a', 'waiting_permission'), agent('b', 'working')];
    expect(choose(urgent, { shown: new Map([['a', NOW - 20_000]]) })?.subjects[0]).toBe('a');
  });

  it('sweeps from a different bearing when the same floor comes round again', () => {
    const idle = [agent('a', 'idle'), agent('b', 'idle'), agent('c', 'idle')];
    const styles = new Set(
      [0, 1, 2].map(
        (n) =>
          choose(idle, { shown: new Map(Array.from({ length: n }, (_, i) => [String(i), 0])) })!
            .style,
      ),
    );
    expect(styles.size).toBeGreaterThan(1);
  });
});

it('never aims at a departed recipient or an unoccupied saved seat', () => {
  expect(choose([agent('a', 'working')], { pulses: [pulse(500)] })?.subjects).toEqual(['a']);
  const s = choose([agent('c', 'idle')])!;
  expect(s.floor).toBe(1);
  const at = poseAt(s, seats, 0.5, 1.6);
  expect(Math.hypot(at.target[0] - 8, at.target[2] + 6)).toBeLessThan(2);
});

it('keeps both employees inside a portrait pair shot throughout the dolly', async () => {
  const THREE_BUILD = '../../packages/office-scene/node_modules/three/build/three.module.js';
  const { PerspectiveCamera, Vector3 } = (await import(THREE_BUILD)) as typeof import('three');
  const s = choose([agent('a', 'idle'), agent('b', 'idle')], { pulses: [pulse(500)] })!;
  for (const aspect of [0.46, 0.7, 1.6])
    for (const t of [0, 0.5, 1]) {
      const at = poseAt(s, seats, t, aspect);
      const camera = new PerspectiveCamera(at.fov, aspect, 0.4, 2400);
      camera.position.set(...at.position);
      camera.lookAt(new Vector3(...at.target));
      camera.updateMatrixWorld();
      for (const id of s.subjects) {
        const seat = seats.get(id)!;
        const p = new Vector3(seat.x, 1.05, seat.z + 0.75).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(0.82);
        expect(Math.abs(p.y)).toBeLessThan(0.82);
        expect(p.z).toBeLessThan(1);
      }
    }
});

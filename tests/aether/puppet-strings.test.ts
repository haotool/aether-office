import { describe, expect, it } from 'vitest';
import {
  anchorsOf,
  chooseAnchors,
  registerAnchors,
  seatedAnchors,
  toWorld,
} from '../../packages/office-scene/src/squad/puppet/anchors.js';
import {
  MEMBER_CAPACITY,
  SEGMENT_CAPACITY,
  STRINGS_PER_MEMBER,
  createRig,
  updateRig,
  type RigMember,
} from '../../packages/office-scene/src/squad/puppet/rig.js';
import {
  JERK_DIP_M,
  calmMotion,
  stepMotion,
  visible,
} from '../../packages/office-scene/src/squad/puppet/string-motion.js';
import {
  POINTS,
  TELEPORT_M,
  checksum,
  createStrings,
  pinString,
  stepStrings,
  type Strings,
} from '../../packages/office-scene/src/squad/puppet/verlet.js';

const within = (
  s: Strings,
  i: number,
  lo: readonly number[],
  hi: readonly number[],
  margin: number,
) => {
  for (let p = 0; p < POINTS; p++)
    for (let k = 0; k < 3; k++) {
      const v = s.pos[(i * POINTS + p) * 3 + k]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(lo[k]! - margin);
      expect(v).toBeLessThanOrEqual(hi[k]! + margin);
    }
};

const GOLDEN = 1315462519;

describe('the verlet step', () => {
  const run = (frames: number, dt = 1 / 60) => {
    const s = createStrings(4);
    pinString(s, 0, [0, 2.7, 0], [0, 1.46, 0], 0, false);
    pinString(s, 1, [0, 2.7, 0], [0.3, 0.7, -0.26], 0.5, false);
    for (let n = 0; n < frames; n++) stepStrings(s, dt, 30);
    return s;
  };

  it('is deterministic: the same pins and the same frames give the same points (golden checksum)', () => {
    expect(checksum(run(300))).toBe(checksum(run(300)));
    expect(checksum(run(120))).toBe(GOLDEN);
  });

  it('runs at a fixed rate whatever the frame rate: whole steps, the rest carried', () => {
    const s = createStrings(1);
    pinString(s, 0, [0, 2, 0], [0, 1, 0], 0, false);
    expect(stepStrings(s, 1 / 60, 30)).toBe(0);
    expect(stepStrings(s, 1 / 60, 30)).toBe(1);
    expect(stepStrings(s, 0.1, 30)).toBe(3);
  });

  it('keeps every point of a taut string between its pins', () => {
    const s = run(600);
    within(s, 0, [0, 1.46, 0], [0, 2.7, 0], 0.05);
    const mid = (POINTS >> 1) * 3;
    expect(Math.abs(s.pos[mid]!)).toBeLessThan(0.08);
  });

  it('hangs a slack string lower than a taut one', () => {
    const taut = createStrings(1);
    const slack = createStrings(1);
    pinString(taut, 0, [0, 2.7, 0], [0.5, 1.5, 0], 0, false);
    pinString(slack, 0, [0, 2.7, 0], [0.5, 1.5, 0], 1, false);
    for (let n = 0; n < 200; n++) {
      stepStrings(taut, 1 / 30, 30);
      stepStrings(slack, 1 / 30, 30);
    }
    const lowest = (s: Strings) => Math.min(...[1, 2, 3, 4].map((p) => s.pos[p * 3 + 1]!));
    expect(lowest(slack)).toBeLessThan(lowest(taut));
  });

  it('survives extreme time steps: a minute-long stall, a negative or a non-numeric dt', () => {
    const s = run(10);
    for (const dt of [60, 1e9, -5, Number.NaN, Infinity, 0]) stepStrings(s, dt, 30);
    within(s, 0, [0, 1.46, 0], [0, 2.7, 0], 0.5);
    within(s, 1, [0, 0.7, -0.26], [0.3, 2.7, 0], 0.5);
  });

  it('lays a string straight again when a pin teleports, instead of whipping', () => {
    const s = run(120);
    pinString(s, 0, [40, 2.7, 40], [40, 1.46, 40], 0, false);
    stepStrings(s, 1 / 30, 30);
    within(s, 0, [40, 1.46, 40], [40, 2.7, 40], 0.1);
    pinString(s, 0, [40 + TELEPORT_M * 0.9, 2.7, 40], [40 + TELEPORT_M * 0.9, 1.46, 40], 0, false);
    for (let n = 0; n < 30; n++) stepStrings(s, 1 / 30, 30);
    within(s, 0, [40, 1.46, 40], [43, 2.7, 40], 0.6);
  });

  it('ignores a pin that is not a number and a string outside the pool', () => {
    const s = createStrings(2);
    pinString(s, 0, [0, 2, 0], [0, 1, 0], 0, false);
    pinString(s, 0, [Number.NaN, 2, 0], [0, 1, 0], 0, false);
    pinString(s, 5, [0, 2, 0], [0, 1, 0], 0, false);
    pinString(s, -1, [0, 2, 0], [0, 1, 0], 0, false);
    for (let n = 0; n < 60; n++) stepStrings(s, 1 / 30, 30);
    within(s, 0, [0, 1, 0], [0, 2, 0], 0.05);
    expect(s.count).toBe(1);
  });

  it('holds a frozen string where it is, while its pins still follow', () => {
    const s = createStrings(1);
    pinString(s, 0, [0, 2, 0], [0, 1, 0], 0, false);
    for (let n = 0; n < 30; n++) stepStrings(s, 1 / 30, 30);
    pinString(s, 0, [0.1, 2, 0], [0.1, 1, 0], 0, true);
    const before = s.pos[3 * 3 + 1]!;
    for (let n = 0; n < 30; n++) stepStrings(s, 1 / 30, 30);
    expect(s.pos[3 * 3 + 1]).toBe(before);
    expect(s.pos[0]).toBeCloseTo(0.1, 5);
  });

  it('simulates twelve subagents well inside the budget (the perf gate measures it for real)', () => {
    const s = createStrings(48);
    for (let i = 0; i < 48; i++) pinString(s, i, [i, 2.7, 0], [i, 1.4, 0.3], 0, false);
    const start = performance.now();
    for (let n = 0; n < 300; n++) stepStrings(s, 1 / 30, 30);
    expect((performance.now() - start) / 300).toBeLessThan(2);
  });
});

describe('what a subagent does to its strings', () => {
  const settle = (
    m: ReturnType<typeof calmMotion>,
    phase: 'working' | 'idle' | 'waiting' | 'finished',
    seconds: number,
    toolAt: number | null = null,
  ) => {
    let now = m;
    for (let t = 0; t < seconds * 60; t++) now = stepMotion(now, { phase, toolAt }, 1 / 60);
    return now;
  };

  it('goes taut and shows while it works, slack and gone once it is quiet', () => {
    const working = settle(calmMotion(null), 'working', 2);
    expect(working).toMatchObject({ slack: 0, alpha: 1 });
    const quiet = settle(working, 'idle', 1.2);
    expect(quiet.slack).toBe(1);
    expect(visible(quiet)).toBe(true);
    expect(visible(settle(quiet, 'idle', 8))).toBe(false);
  });

  it('eases the slack over a second, not at once', () => {
    const half = settle(settle(calmMotion(null), 'working', 2), 'finished', 0.5);
    expect(half.slack).toBeGreaterThan(0.3);
    expect(half.slack).toBeLessThan(0.7);
  });

  it('jerks when the tool start time changes, and only then', () => {
    let m = settle(calmMotion(100), 'working', 2, 100);
    expect(m.dip).toBe(0);
    m = stepMotion(m, { phase: 'working', toolAt: 100 }, 1 / 60);
    expect(m.dip).toBe(0);
    m = stepMotion(m, { phase: 'working', toolAt: 200 }, 1 / 60);
    expect(m.dip).toBeLessThan(JERK_DIP_M / 2);
    expect(m.dip).toBeGreaterThan(JERK_DIP_M * 1.1);
    const settled = settle(m, 'working', 0.4, 200);
    expect(Math.abs(settled.dip)).toBeLessThan(0.002);
  });

  it('never overshoots the dip (critically damped)', () => {
    let m = stepMotion(
      settle(calmMotion(1), 'working', 1, 1),
      { phase: 'working', toolAt: 2 },
      1 / 60,
    );
    for (let t = 0; t < 120; t++) {
      m = stepMotion(m, { phase: 'working', toolAt: 2 }, 1 / 60);
      expect(m.dip).toBeLessThanOrEqual(0);
    }
  });

  it('does not jerk on the first look at a subagent that already ran tools', () => {
    expect(stepMotion(calmMotion(null), { phase: 'working', toolAt: 500 }, 1 / 60).dip).toBe(0);
  });

  it('holds still while it waits for a person: no jerk, no fading', () => {
    const waiting = settle(settle(calmMotion(1), 'working', 1, 1), 'waiting', 1, 9);
    expect(waiting).toMatchObject({ dip: 0, alpha: 1, slack: 0 });
  });

  it('survives a stalled frame', () => {
    const m = stepMotion(calmMotion(1), { phase: 'working', toolAt: 2 }, 1e9);
    expect(Number.isFinite(m.dip + m.dipSpeed + m.slack + m.alpha)).toBe(true);
  });
});

describe('where the strings are tied (anchor selection)', () => {
  const chair = { x: 10, z: -4, yaw: 0, y: 3 };

  it('ties the head and two hands under a cross that floats over the head', () => {
    const a = seatedAnchors(chair);
    expect(a.cross[1]).toBeGreaterThan(a.head[1] + 1);
    expect(a.head[0]).toBe(10);
    expect(a.handL[0]).toBeLessThan(a.handR[0]);
    expect(a.handL[1]).toBeLessThan(a.head[1]);
    expect(a.head[1]).toBe(3 + 1.46);
  });

  it('turns the whole rig with the pod: a quarter turn swaps the axes, the height stays', () => {
    const east = toWorld({ ...chair, yaw: Math.PI / 2 }, [0, 1, -1]);
    expect(east[0]).toBeCloseTo(10 - 1, 5);
    expect(east[1]).toBe(4);
    expect(east[2]).toBeCloseTo(-4, 5);
    const rotated = seatedAnchors({ ...chair, yaw: Math.PI });
    expect(rotated.handL[0]).toBeGreaterThan(rotated.handR[0]);
  });
});

describe('the rig', () => {
  const chair = { x: 0, z: 0, yaw: 0, y: 0 };
  const member = (id: string, over: Partial<RigMember> = {}): RigMember => ({
    id,
    phase: 'working',
    toolAt: null,
    chair: { ...chair, x: Number(id.slice(1)) * 2 },
    master: [0, 2.25, 4],
    ...over,
  });

  it('gives each subagent four strings in a slot of its own, kept for as long as it is there', () => {
    const rig = createRig();
    updateRig(rig, [member('a1'), member('a2')], 1 / 30, { simulate: true, hz: 30 });
    expect([...rig.slots]).toEqual([
      ['a1', 0],
      ['a2', 1],
    ]);
    expect(rig.strings.count).toBe(2 * STRINGS_PER_MEMBER);
    updateRig(rig, [member('a2')], 1 / 30, { simulate: true, hz: 30 });
    expect(rig.slots.get('a2')).toBe(1);
    updateRig(rig, [member('a2'), member('a3')], 1 / 30, { simulate: true, hz: 30 });
    expect(rig.slots.get('a3')).toBe(0);
  });

  it('starts a slot straight for a new subagent, whatever the last tenant left in it', () => {
    const rig = createRig();
    for (let n = 0; n < 60; n++) updateRig(rig, [member('a1')], 1 / 30, { simulate: true, hz: 30 });
    updateRig(rig, [], 1 / 30, { simulate: true, hz: 30 });
    updateRig(rig, [member('a9')], 1 / 30, { simulate: true, hz: 30 });
    const x = rig.strings.pos[3 * 3]!;
    expect(Math.abs(x - 18)).toBeLessThan(1);
  });

  it('carries no more than its capacity and never throws past it', () => {
    const rig = createRig();
    const many = Array.from({ length: MEMBER_CAPACITY + 10 }, (_, n) => member(`a${n}`));
    expect(() => updateRig(rig, many, 1 / 30, { simulate: true, hz: 30 })).not.toThrow();
    expect(rig.slots.size).toBe(MEMBER_CAPACITY);
  });

  it('draws straight static lines and no motion when it must keep still', () => {
    const rig = createRig();
    const m = member('a1', { toolAt: 1 });
    for (let n = 0; n < 5; n++)
      updateRig(rig, [{ ...m, toolAt: n + 1 }], 1 / 30, { simulate: false, hz: 30 });
    const motion = rig.motions.get('a1')!;
    expect(motion).toMatchObject({ dip: 0, slack: 0, alpha: 1 });
    const a = seatedAnchors(m.chair);
    const mid = (2 * 3 + 0) * 0 + 2 * 3;
    expect(rig.strings.pos[mid]).toBeCloseTo(a.cross[0] + (a.head[0] - a.cross[0]) * 0.4, 4);
    expect(rig.strings.pos[mid + 1]).toBeCloseTo(a.cross[1] + (a.head[1] - a.cross[1]) * 0.4, 4);
  });

  it('keeps the pool and the segments inside the one-draw budget', () => {
    expect(SEGMENT_CAPACITY).toBe(MEMBER_CAPACITY * STRINGS_PER_MEMBER * (POINTS - 1));
    expect(SEGMENT_CAPACITY).toBeLessThanOrEqual(1024);
    expect(MEMBER_CAPACITY * STRINGS_PER_MEMBER * POINTS * 3 * 4 * 2).toBeLessThan(64 * 1024);
  });
});

type Vec = [number, number, number];

describe("the rig's own sockets (v2 anchors)", () => {
  const model = (at: Vec, names = ['head_socket', 'hand_socket_L', 'hand_socket_R']) => {
    const places = new Map<string, { local: Vec }>(
      names.map((name, n) => [
        name,
        { local: [n === 1 ? -0.3 : n === 2 ? 0.3 : 0, n === 0 ? 1.4 : 0.7, 0] as Vec },
      ]),
    );
    const root = {
      getObjectByName: (name: string) => {
        const node = places.get(name);
        return (
          node && {
            get matrixWorld() {
              return {
                elements: [
                  1,
                  0,
                  0,
                  0,
                  0,
                  1,
                  0,
                  0,
                  0,
                  0,
                  1,
                  0,
                  at[0] + node.local[0],
                  at[1] + node.local[1],
                  at[2] + node.local[2],
                  1,
                ],
              };
            },
          }
        );
      },
    };
    return { root, places };
  };

  it('ties to the real head and hands of a registered character, in the world', () => {
    const { root, places } = model([10, 3, -4]);
    const forget = registerAnchors('c1', root);
    const found = anchorsOf('c1')!;
    expect(found.head[0]).toBeCloseTo(10, 5);
    expect(found.head[1]).toBeGreaterThan(3 + 1.4);
    expect(found.handL[0]).toBeCloseTo(9.7, 5);
    expect(found.handR[0]).toBeCloseTo(10.3, 5);
    places.get('hand_socket_L')!.local[1] = 0.9;
    expect(anchorsOf('c1')!.handL[1]).toBeCloseTo(3.9, 5);
    forget();
    expect(anchorsOf('c1')).toBeNull();
  });

  it('keeps to the fixed offsets for a model without sockets, and for one not placed yet', () => {
    expect(registerAnchors('c2', model([5, 0, 5], ['head_socket']).root)).toBeInstanceOf(Function);
    expect(anchorsOf('c2')).toBeNull();
    registerAnchors('c3', model([0, 0, 0]).root);
    expect(anchorsOf('c3')).toBeNull();
    const fixed = seatedAnchors({ x: 1, z: 2, yaw: 0, y: 0 });
    expect(chooseAnchors(fixed, null)).toBe(fixed);
    const sockets = { head: [1, 2, 3], handL: [4, 5, 6], handR: [7, 8, 9] } as const;
    expect(chooseAnchors(fixed, sockets)).toEqual({ cross: fixed.cross, ...sockets });
  });

  it('forgets only its own registration when a character is drawn again under the same id', () => {
    const first = registerAnchors('c4', model([2, 0, 2]).root);
    const second = registerAnchors('c4', model([8, 0, 8]).root);
    first();
    expect(anchorsOf('c4')!.head[0]).toBeCloseTo(8, 5);
    second();
    expect(anchorsOf('c4')).toBeNull();
  });
});

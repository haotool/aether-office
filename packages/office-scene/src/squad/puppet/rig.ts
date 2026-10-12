import {
  HAND_LIFT,
  calmMotion,
  stepMotion,
  type StringMotion,
  type StringPhase,
} from './string-motion.js';
import { chooseAnchors, seatedAnchors, type Chair, type Sockets } from './anchors.js';
import {
  POINTS,
  createStrings,
  pinString,
  stepStrings,
  straighten,
  type Strings,
  type Vec3,
} from './verlet.js';

export const STRINGS_PER_MEMBER = 4;
export const MEMBER_CAPACITY = 48;
export const SEGMENT_CAPACITY = MEMBER_CAPACITY * STRINGS_PER_MEMBER * (POINTS - 1);

export type RigMember = {
  id: string;
  phase: StringPhase;
  toolAt: number | null;
  chair: Chair;
  sockets?: Sockets | null;
  master: Vec3;
};

type Rig = {
  strings: Strings;
  slots: Map<string, number>;
  motions: Map<string, StringMotion>;
  seen: Map<string, number>;
  round: number;
};

export function createRig(): Rig {
  return {
    strings: createStrings(MEMBER_CAPACITY * STRINGS_PER_MEMBER),
    slots: new Map(),
    motions: new Map(),
    seen: new Map(),
    round: 0,
  };
}

function slotOf(rig: Rig, id: string): number | null {
  const known = rig.slots.get(id);
  if (known !== undefined) return known;
  const taken = new Set(rig.slots.values());
  for (let slot = 0; slot < MEMBER_CAPACITY; slot++)
    if (!taken.has(slot)) {
      rig.slots.set(id, slot);
      for (let k = 0; k < STRINGS_PER_MEMBER; k++)
        rig.strings.started[slot * STRINGS_PER_MEMBER + k] = 0;
      return slot;
    }
  return null;
}

function releaseGone(rig: Rig): void {
  for (const [id, slot] of rig.slots)
    if (rig.seen.get(id) !== rig.round) {
      for (let k = 0; k < STRINGS_PER_MEMBER; k++)
        rig.strings.started[slot * STRINGS_PER_MEMBER + k] = 0;
      rig.slots.delete(id);
      rig.seen.delete(id);
      rig.motions.delete(id);
    }
}

function tieMember(rig: Rig, m: RigMember, slot: number, dt: number, simulate: boolean): void {
  const before = rig.motions.get(m.id) ?? calmMotion(m.toolAt);
  const motion = simulate
    ? stepMotion(before, { phase: m.phase, toolAt: m.toolAt }, dt)
    : {
        ...calmMotion(m.toolAt),
        slack: 0,
        alpha: m.phase === 'working' || m.phase === 'waiting' ? 1 : 0,
      };
  rig.motions.set(m.id, motion);
  const a = chooseAnchors(seatedAnchors(m.chair), m.sockets ?? null);
  const cross: Vec3 = [a.cross[0], a.cross[1] + motion.dip, a.cross[2]];
  const lift = (v: Vec3): Vec3 => [v[0], v[1] + HAND_LIFT * motion.dip, v[2]];
  const base = slot * STRINGS_PER_MEMBER;
  const frozen = m.phase === 'waiting';
  pinString(rig.strings, base, cross, a.head, motion.slack, frozen);
  pinString(rig.strings, base + 1, cross, lift(a.handL), motion.slack, frozen);
  pinString(rig.strings, base + 2, cross, lift(a.handR), motion.slack, frozen);
  pinString(rig.strings, base + 3, cross, m.master, motion.slack, frozen);
}

export function updateRig(
  rig: Rig,
  members: readonly RigMember[],
  dt: number,
  options: { simulate: boolean; hz: number },
): number {
  rig.round += 1;
  for (const m of members) rig.seen.set(m.id, rig.round);
  releaseGone(rig);
  let used = 0;
  for (const m of members) {
    const slot = slotOf(rig, m.id);
    if (slot === null) continue;
    used = Math.max(used, slot + 1);
    tieMember(rig, m, slot, dt, options.simulate);
  }
  rig.strings.count = used * STRINGS_PER_MEMBER;
  if (!options.simulate) {
    for (let i = 0; i < rig.strings.count; i++)
      if (rig.strings.started[i]) straighten(rig.strings, i);
    return 1;
  }
  return stepStrings(rig.strings, dt, options.hz);
}

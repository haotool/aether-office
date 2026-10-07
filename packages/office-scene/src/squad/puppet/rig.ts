// The rig of the whole scene: a slot of four strings for each live subagent (head, left hand, right hand, and the master
// thread from the cross to the supervisor), the motion of each, and the pins they are tied to. Pure and typed-array
// backed; PuppetStrings.tsx reads the points and draws them.
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

/** Strings per subagent: the head, the two hands and the master thread. */
export const STRINGS_PER_MEMBER = 4;
/** Subagents the rig carries at once (a floor's character budget is 16; an exploded building shows them all). */
export const MEMBER_CAPACITY = 48;
/** Line segments the one draw needs room for. */
export const SEGMENT_CAPACITY = MEMBER_CAPACITY * STRINGS_PER_MEMBER * (POINTS - 1);

export type RigMember = {
  id: string;
  phase: StringPhase;
  toolAt: number | null;
  chair: Chair;
  /** The character's own head and hand sockets, when it has registered them (see anchors.ts). */
  sockets?: Sockets | null;
  /** Where the master thread ends: over the supervisor (its halo). */
  master: Vec3;
};

export type Rig = {
  strings: Strings;
  /** Slot of each live member (its strings are `slot * STRINGS_PER_MEMBER` and the three after it). */
  slots: Map<string, number>;
  motions: Map<string, StringMotion>;
  /** The round each member was last listed in, to find the ones that went (no allocation per frame). */
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
  const taken = new Set(rig.slots.values()); // only when a member is new
  for (let slot = 0; slot < MEMBER_CAPACITY; slot++)
    if (!taken.has(slot)) {
      rig.slots.set(id, slot);
      for (let k = 0; k < STRINGS_PER_MEMBER; k++)
        rig.strings.started[slot * STRINGS_PER_MEMBER + k] = 0; // a new tenant starts straight
      return slot;
    }
  return null; // full: this one has no strings
}

/**
 * Ties the strings of `members` to their pins for this frame and advances the simulation by `dt`. A member that is no
 * longer listed gives its slot back. With `simulate` off (reduced motion, Calm) the strings are laid straight and nothing
 * moves. Returns the steps run (0: the points are as they were).
 */
export function updateRig(
  rig: Rig,
  members: readonly RigMember[],
  dt: number,
  options: { simulate: boolean; hz: number },
): number {
  rig.round += 1;
  for (const m of members) rig.seen.set(m.id, rig.round);
  for (const [id, slot] of rig.slots)
    if (rig.seen.get(id) !== rig.round) {
      // Gone: its strings are given back, and the next tenant starts straight.
      for (let k = 0; k < STRINGS_PER_MEMBER; k++)
        rig.strings.started[slot * STRINGS_PER_MEMBER + k] = 0;
      rig.slots.delete(id);
      rig.seen.delete(id);
      rig.motions.delete(id);
    }
  let used = 0;
  for (const m of members) {
    const slot = slotOf(rig, m.id);
    if (slot === null) continue;
    used = Math.max(used, slot + 1);
    const before = rig.motions.get(m.id) ?? calmMotion(m.toolAt);
    const motion = options.simulate
      ? stepMotion(before, { phase: m.phase, toolAt: m.toolAt }, dt)
      : // Still: no jerk, no sway, no slack: strings are there or not.
        {
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
  rig.strings.count = used * STRINGS_PER_MEMBER;
  if (!options.simulate) {
    for (let i = 0; i < rig.strings.count; i++)
      if (rig.strings.started[i]) straighten(rig.strings, i);
    return 1;
  }
  return stepStrings(rig.strings, dt, options.hz);
}

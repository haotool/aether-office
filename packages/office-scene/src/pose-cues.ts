import type { ClipName } from './animal-states.js';

// One place that decides which pose a member takes: the person's emote, a hand-over's nod, a life effect's gesture. Pure.
// A pose is an existing clip (played once over what the member is doing, see Animal's `emote` cue) or a turn of the chair
// (a rigid yaw, see Poser's `turn`). Micro-actions (behavior.ts) are not requests: they only run while nothing else is
// playing (Animal's `busy`), which makes them the lowest priority by construction.

/** Who asks. A higher one takes over from a lower one that is still playing; a lower one waits its turn (it is dropped, never queued). */
export type PoseSource = 'emote' | 'handover' | 'life';
export const POSE_PRIORITY: Readonly<Record<PoseSource, number>> = {
  emote: 3,
  handover: 2,
  life: 1,
};

/** How long a clip is assumed to hold its member: the longest of the one-shots is about this. */
export const POSE_HOLD_MS = 2500;
/** A life effect never repeats the same clip on a member within this long, and a member takes at most one life pose per gap. */
export const LIFE_CLIP_COOLDOWN_MS = 30_000;
export const LIFE_GAP_MS = 8000;

export type PoseTurn = { yaw: number; holdMs: number };
export type PoseRequest = {
  member: string;
  source: PoseSource;
  /** A clip to play once... */
  clip?: ClipName;
  /** ...or a turn of the chair held for a while (radians about the vertical, within a glance). */
  turn?: PoseTurn;
};

export type PoseGate = {
  /** What each member is doing now: who asked and until when. */
  holds: Readonly<Record<string, { source: PoseSource; until: number }>>;
  /** When a life pose last played: per member and clip, and per member. */
  lifeClip: Readonly<Record<string, number>>;
  lifeMember: Readonly<Record<string, number>>;
};
export const emptyPoseGate: PoseGate = { holds: {}, lifeClip: {}, lifeMember: {} };

export type PoseVerdict =
  { ok: true; gate: PoseGate } | { ok: false; reason: 'reduced-motion' | 'busy' | 'cooldown' };

const holdOf = (request: PoseRequest) => request.turn?.holdMs ?? POSE_HOLD_MS;
const what = (request: PoseRequest) => request.clip ?? 'turn';

/**
 * May this member take this pose now? With reduced motion nothing plays (the clips and the turns are motion). A member
 * that is holding a pose of the same or a higher priority is left alone; a higher request takes over. A life effect is also
 * held back by its own cooldowns, so a crowd of effects cannot make one member gesticulate.
 */
export function admitPose(
  gate: PoseGate,
  request: PoseRequest,
  now: number,
  reducedMotion: boolean,
): PoseVerdict {
  if (reducedMotion) return { ok: false, reason: 'reduced-motion' };
  const holding = gate.holds[request.member];
  if (
    holding &&
    now < holding.until &&
    POSE_PRIORITY[holding.source] >= POSE_PRIORITY[request.source]
  )
    return { ok: false, reason: 'busy' };
  const life = request.source === 'life';
  const clipKey = `${request.member}:${what(request)}`;
  if (
    life &&
    (now - (gate.lifeClip[clipKey] ?? -Infinity) < LIFE_CLIP_COOLDOWN_MS ||
      now - (gate.lifeMember[request.member] ?? -Infinity) < LIFE_GAP_MS)
  )
    return { ok: false, reason: 'cooldown' };
  return {
    ok: true,
    gate: {
      holds: {
        ...gate.holds,
        [request.member]: { source: request.source, until: now + holdOf(request) },
      },
      lifeClip: life ? { ...gate.lifeClip, [clipKey]: now } : gate.lifeClip,
      lifeMember: life ? { ...gate.lifeMember, [request.member]: now } : gate.lifeMember,
    },
  };
}

const EASE_IN_MS = 500;
const EASE_OUT_MS = 700;

/** How far into a turn a member is, 0 to 1, `age` ms after it was asked: eased in, held, eased out. */
export function turnWeight(age: number, holdMs: number): number {
  if (age < 0 || age > holdMs + EASE_OUT_MS) return 0;
  if (age < EASE_IN_MS) return age / EASE_IN_MS;
  return age <= holdMs ? 1 : 1 - (age - holdMs) / EASE_OUT_MS;
}

import type { ClipName } from '../animals/animal-states.js';

/** Who asks. A higher one takes over from a lower one that is still playing; a lower one waits its turn (it is dropped, never queued). */
type PoseSource = 'emote' | 'handover' | 'life';
export const POSE_PRIORITY: Readonly<Record<PoseSource, number>> = {
  emote: 3,
  handover: 2,
  life: 1,
};

export const POSE_HOLD_MS = 2500;
/** A life effect never repeats the same clip on a member within this long, and a member takes at most one life pose per gap. */
export const LIFE_CLIP_COOLDOWN_MS = 30_000;
export const LIFE_GAP_MS = 8000;

export type PoseTurn = { yaw: number; holdMs: number };
export type PoseRequest = {
  member: string;
  source: PoseSource;
  clip?: ClipName;
  turn?: PoseTurn;
};

export type PoseGate = {
  holds: Readonly<Record<string, { source: PoseSource; until: number }>>;
  lifeClip: Readonly<Record<string, number>>;
  lifeMember: Readonly<Record<string, number>>;
};
export const emptyPoseGate: PoseGate = { holds: {}, lifeClip: {}, lifeMember: {} };

type PoseVerdict =
  { ok: true; gate: PoseGate } | { ok: false; reason: 'reduced-motion' | 'busy' | 'cooldown' };

const holdOf = (request: PoseRequest) => request.turn?.holdMs ?? POSE_HOLD_MS;
const what = (request: PoseRequest) => request.clip ?? 'turn';

/**
 * A member holding a pose of the same or a higher priority is left alone; a higher request takes over. Cooldowns also
 * hold effects back, so a crowd of effects cannot make one member gesticulate.
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

export function turnWeight(age: number, holdMs: number): number {
  if (age < 0 || age > holdMs + EASE_OUT_MS) return 0;
  if (age < EASE_IN_MS) return age / EASE_IN_MS;
  return age <= holdMs ? 1 : 1 - (age - holdMs) / EASE_OUT_MS;
}

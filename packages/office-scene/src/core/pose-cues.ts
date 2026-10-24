import type { ClipName } from '../animals/animal-states.js';

/** Who asks. A higher one takes over from a lower one that is still playing; a lower one waits its turn (it is dropped, never queued). */
type PoseSource = 'emote' | 'handover';
export const POSE_PRIORITY: Readonly<Record<PoseSource, number>> = {
  emote: 3,
  handover: 2,
};

export const POSE_HOLD_MS = 2500;

export type PoseTurn = { yaw: number; holdMs: number };
export type PoseRequest = {
  member: string;
  source: PoseSource;
  clip?: ClipName;
  turn?: PoseTurn;
};

export type PoseGate = {
  holds: Readonly<Record<string, { source: PoseSource; until: number }>>;
};
export const emptyPoseGate: PoseGate = { holds: {} };

type PoseVerdict = { ok: true; gate: PoseGate } | { ok: false; reason: 'reduced-motion' | 'busy' };

const holdOf = (request: PoseRequest) => request.turn?.holdMs ?? POSE_HOLD_MS;

/** A member holding a pose of the same or a higher priority is left alone; a higher request takes over. */
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
  return {
    ok: true,
    gate: {
      holds: {
        ...gate.holds,
        [request.member]: { source: request.source, until: now + holdOf(request) },
      },
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

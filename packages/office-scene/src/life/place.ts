import type { Seat } from '../environment/director.js';
import { hashText } from '../environment/hash.js';
import { toWorld } from '../core/shot-camera.js';
import { EFFECTS } from './effects/index.js';
import type { PlacedSprite, Sprite } from './effects/types.js';
import { ruleOf } from './registry.js';
import type { LifeCue } from './schedule.js';

export type Stage = {
  seats: ReadonlyMap<string, Seat>;
  /** The floor shown (stacked) and whether the building is spread apart: only desks in view get pictures. */
  floor: number;
  exploded: boolean;
  floorY: (floor: number, exploded: boolean) => number;
  reducedMotion: boolean;
};

/** The most desks a building-wide effect dresses at once. */
export const EACH_DESK_MAX = 24;
/** With reduced motion an effect is one still picture, taken this far through it (its pictures are fully in by then). */
const STILL_AT = 0.4;

const inView = (stage: Stage, seat: Seat) => stage.exploded || seat.floor === stage.floor;

const placed = (s: Sprite, at: readonly [number, number, number]): PlacedSprite => ({
  cell: s.cell,
  x: at[0],
  y: at[1],
  z: at[2],
  size: s.size,
  alpha: s.alpha ?? 1,
  rot: s.rot ?? 0,
  flat: s.flat ?? false,
  tint: s.tint ?? [1, 1, 1],
});

/** The sprites of a cue `now`, in the world: its effect's timeline put on the desk, the group or every desk it belongs to. */
export function cueSprites(cue: LifeCue, now: number, stage: Stage): PlacedSprite[] {
  const rule = ruleOf(cue.rule);
  if (!rule) return [];
  const t = cue.frozenT ?? (stage.reducedMotion ? cue.durationMs * STILL_AT : now - cue.startedAt);
  if (t < 0 || t > cue.durationMs) return [];
  const effect = EFFECTS[cue.rule];
  const onDesk = (member: string, seed: number): PlacedSprite[] => {
    const seat = stage.seats.get(member);
    if (!seat || !inView(stage, seat)) return [];
    const base = stage.floorY(seat.floor, stage.exploded);
    return effect(t, cue.durationMs, seed, cue.value).map((s) =>
      placed(s, toWorld(seat, [...s.at], base)),
    );
  };
  if (rule.anchor === 'desk') return cue.member ? onDesk(cue.member, cue.seed) : [];
  if (rule.anchor === 'each-desk')
    return [...stage.seats]
      .filter(([, seat]) => inView(stage, seat))
      .slice(0, EACH_DESK_MAX)
      .flatMap(([id]) => onDesk(id, cue.seed ^ hashText(id)));
  const seats = cue.group
    .flatMap((id) => stage.seats.get(id) ?? [])
    .filter((s) => inView(stage, s));
  const [first] = seats;
  if (!first) return [];
  const centre = {
    x: seats.reduce((sum, s) => sum + s.x, 0) / seats.length,
    z: seats.reduce((sum, s) => sum + s.z, 0) / seats.length,
  };
  const base = stage.floorY(first.floor, stage.exploded);
  return effect(t, cue.durationMs, cue.seed, cue.value).map((s) =>
    placed(s, [centre.x + s.at[0], base + s.at[1], centre.z + s.at[2]]),
  );
}

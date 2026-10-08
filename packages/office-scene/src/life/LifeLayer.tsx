import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Seat } from '../director.js';
import { floorY } from '../scene-geometry.js';
import type { PoseApi } from '../use-pose-cues.js';
import type { Quality } from '../scene-types.js';
import { cueSprites, type Stage } from './place.js';
import { createSpritePool } from './pools/sprite-pool.js';
import type { LifeCue, ScheduleEnv } from './schedule.js';
import type { LifeInput } from './signals.js';
import { useLifeRun } from './use-life-run.js';

/** The pace pictures animate at: about 30 a second is plenty for small props, and half what a full-rate frame costs. */
const FRAME_MS = 33;

type LifeLayerProps = {
  input: LifeInput | undefined;
  seats: ReadonlyMap<string, Seat>;
  floor: number;
  exploded: boolean;
  quality: Quality;
  reducedMotion: boolean;
  zh: boolean;
  /** The scene's shared aria log (see use-aria-log.ts). */
  say: (text: string) => void;
  /** The pose registry: an effect's gesture is asked of it (see poses.ts). */
  pose: PoseApi['request'];
};

/** The cues on show now: a preview's frozen ones (a looped one plays on from `t`), else the live ones that have not ended. */
function cuesOnShow(
  preview: NonNullable<LifeInput['preview']> | undefined,
  held: readonly LifeCue[],
  live: readonly LifeCue[],
  now: number,
  loopedAt: number,
): readonly LifeCue[] {
  if (!preview) return live.filter((c) => now < c.startedAt + c.durationMs);
  // A looped preview plays on from `t`: the measurement of what motion costs.
  return preview.loop
    ? held.map((c) => ({ ...c, frozenT: (preview.t + now - loopedAt) % c.durationMs }))
    : held;
}

/**
 * The office's little moments: reads the signals the page derived, lets the scheduler decide which effects start, and
 * draws them as sprites in one draw call. Everything it shows is decorative and is also announced, politely and
 * sparingly, in the scene's hidden log for screen readers. With no input, or in Calm mode, it draws nothing.
 */
export function LifeLayer({
  input,
  seats,
  floor,
  exploded,
  quality,
  reducedMotion,
  zh,
  say,
  pose,
}: LifeLayerProps) {
  const { invalidate } = useThree();
  const pool = useMemo(createSpritePool, []);
  useEffect(() => () => pool.dispose(), [pool]);
  const env: ScheduleEnv = useMemo(() => ({ quality, reducedMotion }), [quality, reducedMotion]);
  const { state, held, loopedAt } = useLifeRun({
    input,
    seats,
    floor,
    exploded,
    env,
    zh,
    say,
    pose,
    invalidate,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const preview = input?.preview;

  useFrame(() => {
    const now = Date.now();
    const live = cuesOnShow(preview, held.current, state.current.live, now, loopedAt.current);
    if (!preview && live.length !== state.current.live.length)
      state.current = { ...state.current, live };
    const stage: Stage = { seats, floor, exploded, floorY, reducedMotion };
    pool.write(live.flatMap((cue) => cueSprites(cue, now, stage)));
    const moving = (!preview || preview.loop) && !reducedMotion && live.length > 0;
    if (moving && timer.current === undefined)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        invalidate();
      }, FRAME_MS);
  });

  return <primitive object={pool.mesh} />;
}

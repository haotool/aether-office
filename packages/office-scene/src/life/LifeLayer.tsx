import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Seat } from '../director.js';
import { floorY } from '../scene-geometry.js';
import type { PoseApi } from '../use-pose-cues.js';
import type { Quality } from '../scene-types.js';
import { lifeContext } from './context.js';
import { cueSprites, type Stage } from './place.js';
import { poseCalls } from './poses.js';
import { createSpritePool } from './pools/sprite-pool.js';
import { ruleOf } from './registry.js';
import {
  emptyLifeState,
  previewCues,
  ruleEnabled,
  schedule,
  type LifeCue,
  type ScheduleEnv,
} from './schedule.js';
import type { LifeInput } from './signals.js';

/** The pace pictures animate at: about 30 a second is plenty for small props, and half what a full-rate frame costs. */
const FRAME_MS = 33;

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
}: {
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
}) {
  const { invalidate } = useThree();
  const pool = useMemo(createSpritePool, []);
  useEffect(() => () => pool.dispose(), [pool]);

  const env: ScheduleEnv = useMemo(() => ({ quality, reducedMotion }), [quality, reducedMotion]);
  const state = useRef(emptyLifeState);
  const announced = useRef(new Set<string>()); // a cue is announced once, however often it is looked at again
  const announce = (cue: LifeCue) => {
    if (announced.current.has(cue.key)) return;
    announced.current.add(cue.key);
    say(cue.aria);
    if (cue.member)
      latest.current.input?.onMoment?.({
        member: cue.member,
        rule: cue.rule,
        text: cue.aria,
        at: Date.now(),
      });
  };
  const gestures = useRef(new Set<ReturnType<typeof setTimeout>>());
  // The effect's gesture, asked of the pose registry when its moment comes; the registry says whether it plays.
  const gesture = (cue: LifeCue) => {
    const rule = ruleOf(cue.rule);
    if (!rule?.pose) return;
    const { seats: all, floor: shown, exploded: spread } = latest.current;
    const inView = [...all].flatMap(([id, seat]) => (spread || seat.floor === shown ? [id] : []));
    for (const call of poseCalls(rule, cue, inView)) {
      const timer = setTimeout(() => {
        gestures.current.delete(timer);
        latest.current.pose(call.request);
      }, call.delayMs);
      gestures.current.add(timer);
    }
  };
  const held = useRef<readonly LifeCue[]>([]); // a contact sheet's frozen cues
  const loopedAt = useRef(Date.now()); // when a looped preview began
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ input, seats, floor, exploded, env, zh, pose });
  latest.current = { input, seats, floor, exploded, env, zh, pose };
  const contextNow = () =>
    lifeContext(
      latest.current.seats,
      latest.current,
      latest.current.input ?? { names: {}, idle: [] },
      latest.current.zh,
    );

  // New signals: the scheduler decides, the log announces, and a frame is asked for when each effect ends.
  useEffect(() => {
    if (!input || input.preview) return;
    const run = schedule(state.current, input.signals, Date.now(), input.prefs, contextNow(), env);
    state.current = run.state;
    for (const cue of run.started) {
      announce(cue);
      gesture(cue);
      window.setTimeout(invalidate, cue.durationMs + 60);
    }
    invalidate();
  }, [input?.signals]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new batch of signals starts effects

  // Settings, tier or motion changed: what is on show and no longer allowed goes at once.
  useEffect(() => {
    if (!input) return;
    const allowed = (cue: LifeCue) => {
      const rule = ruleOf(cue.rule);
      return !!rule && ruleEnabled(rule, input.prefs, env);
    };
    state.current = { ...state.current, live: state.current.live.filter(allowed) };
    invalidate();
  }, [input?.prefs, env, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps -- `input` as a whole is read for its prefs only

  // A contact sheet frame: the named effects held at one moment on the first members.
  const preview = input?.preview;
  useEffect(() => {
    held.current = [];
    if (!input || !preview) return;
    held.current = previewCues(
      preview.effects,
      preview.t,
      preview.members,
      input.prefs,
      contextNow(),
      env,
    );
    for (const cue of held.current) announce(cue);
    invalidate();
  }, [preview, input?.prefs, env, seats, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps -- contextNow reads the latest refs

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      gestures.current.forEach(clearTimeout);
    },
    [],
  );

  useFrame(() => {
    const now = Date.now();
    const cues = preview ? held.current : state.current.live;
    const live = preview
      ? preview.loop // a looped preview plays on from `t`, the measurement of what motion costs
        ? cues.map((c) => ({ ...c, frozenT: (preview.t + now - loopedAt.current) % c.durationMs }))
        : cues
      : cues.filter((c) => now < c.startedAt + c.durationMs);
    if (!preview && live.length !== cues.length) state.current = { ...state.current, live };
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

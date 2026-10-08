import { useEffect, useEffectEvent, useRef } from 'react';
import type { Seat } from '../director.js';
import type { PoseApi } from '../use-pose-cues.js';
import { lifeContext } from './context.js';
import { poseCalls } from './poses.js';
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

/** What the scheduler is told about the scene, as of the latest render. */
type LifeScene = {
  input: LifeInput | undefined;
  seats: ReadonlyMap<string, Seat>;
  floor: number;
  exploded: boolean;
  env: ScheduleEnv;
  zh: boolean;
  /** The scene's shared aria log (see use-aria-log.ts). */
  say: (text: string) => void;
  /** The pose registry: an effect's gesture is asked of it (see poses.ts). */
  pose: PoseApi['request'];
  invalidate: () => void;
};

/** The scheduler's state and the helpers its effects share, as of the latest render. */
function useLifeHelpers(scene: LifeScene) {
  const { input, seats } = scene;
  const state = useRef(emptyLifeState);
  const held = useRef<readonly LifeCue[]>([]); // a contact sheet's frozen cues
  const loopedAt = useRef(Date.now()); // when a looped preview began
  const announced = useRef(new Set<string>()); // a cue is announced once, however often it is looked at again
  const gestures = useRef(new Set<ReturnType<typeof setTimeout>>());
  const askPose = useRef(scene.pose); // a gesture is asked of the registry as it is when its moment comes
  askPose.current = scene.pose;

  const contextNow = () => lifeContext(seats, scene, input ?? { names: {}, idle: [] }, scene.zh);
  const announce = (cue: LifeCue) => {
    if (announced.current.has(cue.key)) return;
    announced.current.add(cue.key);
    scene.say(cue.aria);
    if (cue.member)
      input?.onMoment?.({ member: cue.member, rule: cue.rule, text: cue.aria, at: Date.now() });
  };
  // The effect's gesture, asked of the pose registry when its moment comes; the registry says whether it plays.
  const gesture = (cue: LifeCue) => {
    const rule = ruleOf(cue.rule);
    if (!rule?.pose) return;
    const inView = [...seats].flatMap(([id, seat]) =>
      scene.exploded || seat.floor === scene.floor ? [id] : [],
    );
    for (const call of poseCalls(rule, cue, inView)) {
      const timer = setTimeout(() => {
        gestures.current.delete(timer);
        askPose.current(call.request);
      }, call.delayMs);
      gestures.current.add(timer);
    }
  };
  useEffect(
    () => () => {
      gestures.current.forEach(clearTimeout);
    },
    [],
  );
  return { state, held, loopedAt, contextNow, announce, gesture };
}

type Helpers = ReturnType<typeof useLifeHelpers>;

/** New signals: the scheduler decides, the log announces, and a frame is asked for when each effect ends. */
function useSignalStarts(scene: LifeScene, h: Helpers) {
  const { input, env, invalidate } = scene;
  const startFromSignals = useEffectEvent(() => {
    if (!input || input.preview) return;
    const run = schedule(
      h.state.current,
      input.signals,
      Date.now(),
      input.prefs,
      h.contextNow(),
      env,
    );
    h.state.current = run.state;
    for (const cue of run.started) {
      h.announce(cue);
      h.gesture(cue);
      window.setTimeout(invalidate, cue.durationMs + 60);
    }
    invalidate();
  });
  const signals = input?.signals;
  useEffect(() => startFromSignals(), [signals]);
}

/** Settings, tier or motion changed: what is on show and no longer allowed goes at once. */
function usePrefsGate({ input, env, invalidate }: LifeScene, h: Helpers) {
  const prefs = input?.prefs;
  useEffect(() => {
    if (!prefs) return;
    const allowed = (cue: LifeCue) => {
      const rule = ruleOf(cue.rule);
      return !!rule && ruleEnabled(rule, prefs, env);
    };
    h.state.current = { ...h.state.current, live: h.state.current.live.filter(allowed) };
    invalidate();
  }, [prefs, env, invalidate, h.state]);
}

/** A contact sheet frame: the named effects held at one moment on the first members. */
function usePreviewHold(scene: LifeScene, h: Helpers) {
  const { input, seats, env, invalidate } = scene;
  const preview = input?.preview;
  const holdPreview = useEffectEvent(() => {
    h.held.current = [];
    if (!input || !preview) return;
    h.held.current = previewCues(
      preview.effects,
      preview.t,
      preview.members,
      input.prefs,
      h.contextNow(),
      env,
    );
    for (const cue of h.held.current) h.announce(cue);
    invalidate();
  });
  const prefs = input?.prefs;
  useEffect(() => holdPreview(), [preview, prefs, env, seats, invalidate]);
}

/**
 * Runs the office's moments: new signals go to the scheduler, which decides what starts; each started effect is announced
 * (once) and asks for its gesture; settings that no longer allow an effect remove it at once; a contact sheet's preview
 * is held at one moment. Returns what is on show: the live effects, a preview's frozen ones, when a loop began.
 */
export function useLifeRun(scene: LifeScene) {
  const helpers = useLifeHelpers(scene);
  useSignalStarts(scene, helpers);
  usePrefsGate(scene, helpers);
  usePreviewHold(scene, helpers);
  return { state: helpers.state, held: helpers.held, loopedAt: helpers.loopedAt };
}

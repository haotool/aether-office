import { useEffect, useEffectEvent, useRef } from 'react';
import type { Seat } from '../environment/director.js';
import type { PoseApi } from '../core/use-pose-cues.js';
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

type LifeScene = {
  input: LifeInput | undefined;
  seats: ReadonlyMap<string, Seat>;
  floor: number;
  exploded: boolean;
  env: ScheduleEnv;
  zh: boolean;
  say: (text: string) => void;
  pose: PoseApi['request'];
  invalidate: () => void;
};

function useLifeHelpers(scene: LifeScene) {
  const { input, seats } = scene;
  const state = useRef(emptyLifeState);
  const held = useRef<readonly LifeCue[]>([]);
  const loopedAt = useRef(Date.now());
  const announced = useRef(new Set<string>());
  const gestures = useRef(new Set<ReturnType<typeof setTimeout>>());
  const askPose = useRef(scene.pose);
  askPose.current = scene.pose;

  const contextNow = () => lifeContext(seats, scene, input ?? { names: {}, idle: [] }, scene.zh);
  const announce = (cue: LifeCue) => {
    if (announced.current.has(cue.key)) return;
    announced.current.add(cue.key);
    scene.say(cue.aria);
    if (cue.member)
      input?.onMoment?.({ member: cue.member, rule: cue.rule, text: cue.aria, at: Date.now() });
  };
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

export function useLifeRun(scene: LifeScene) {
  const helpers = useLifeHelpers(scene);
  useSignalStarts(scene, helpers);
  usePrefsGate(scene, helpers);
  usePreviewHold(scene, helpers);
  return { state: helpers.state, held: helpers.held, loopedAt: helpers.loopedAt };
}

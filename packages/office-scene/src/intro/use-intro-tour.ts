import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { tierCount } from '../crown-layout.js';
import { busiestFloor, floorCounts } from '../floor-counts.js';
import { FLOORS } from '../layout.js';
import { OVERVIEW, fittedOffset, lookY } from '../scene-geometry.js';
import type { Pose } from '../shot-camera.js';
import {
  introActive,
  introElapsed,
  introIdle,
  introReducer,
  type IntroOutcome,
} from './intro-machine.js';
import { introPoseAt, introSegmentAt, introSegments, type IntroPhase } from './intro-tour.js';
import { captionKeyOf, type IntroCaptionKey } from './intro-text.js';

/** What the page tells the scene about the first-visit tour. Without it the scene has no tour and no Replay button. */
export type IntroProps = {
  /** The page allows the tour to start by itself now: a first visit this session, the preference on, not under automation. */
  auto: boolean;
  /** The tour is over, however it ended (the page remembers that this session has seen it). */
  onDone?: (outcome: IntroOutcome) => void;
  /** "Don't show again" was chosen. */
  onNever?: () => void;
};

/** The building's state while the tour owns it. */
export type IntroDrive = { floor: number; exploded: boolean };

export type IntroTour = {
  /** The page gave the scene a tour (so Replay exists). */
  available: boolean;
  /** The tour owns the camera and the building's state (and the director waits). */
  active: boolean;
  drive: IntroDrive | null;
  /** The camera pose now, or null when the tour does not hold the camera. Called every frame. */
  pose: (aspect: number) => Pose | null;
  /** The key of the dip showing now, or null. */
  dip: string | null;
  caption: IntroCaptionKey | null;
  facts: { commits: number; tiers: number };
  interrupt: () => void;
  skip: () => void;
  replay: () => void;
  never: () => void;
};

/** Frames that must run smoothly in a row before the tour starts, and the longest the scene waits for them. */
const SMOOTH_FRAMES = 10;
const SMOOTH_MS = 40;
const WAIT_MS = 4000;
const TICK_MS = 100;
const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

const homePose = (floor: number, aspect: number): Pose => {
  const target: Pose['target'] = [0, lookY(floor, false), 0];
  const offset = fittedOffset(OVERVIEW(false), aspect);
  return {
    position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
    target,
    fov: 38,
  };
};

/**
 * The first-visit tour, in the scene: the state machine, the clock, the gate (the scene is warm and frames run smoothly),
 * the inputs that interrupt it and the pose it asks the camera for. The page decides whether it may start by itself
 * (`props.auto`); Replay always may.
 */
export function useIntroTour({
  props,
  warm,
  reducedMotion,
  agents,
  layout,
  commits,
  selectedId,
  focus,
}: {
  props: IntroProps | undefined;
  warm: boolean;
  reducedMotion: boolean;
  agents: readonly Agent[];
  layout: Layout;
  commits: number;
  selectedId: string | null;
  focus: string;
}): IntroTour {
  const [state, dispatch] = useReducer(introReducer, introIdle);
  const latest = useRef({ state, props, reducedMotion });
  latest.current = { state, props, reducedMotion };
  const homeFloor = busiestFloor(floorCounts(agents, layout)) ?? 0;
  const tiers = commits > 0 ? tierCount(commits) : 0;
  const frame = useRef({ homeFloor, tiers });
  frame.current = { homeFloor, tiers };

  const active = introActive(state);
  const phase: IntroPhase | null = state.status === 'playing' ? state.phase : null;
  const reduced = state.status === 'idle' || state.status === 'done' ? false : state.reduced;

  // Starting by itself: once, when the page allows it and the scene is warm.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!props?.auto || !warm || autoStarted.current || document.hidden) return;
    autoStarted.current = true;
    dispatch({ type: 'start', reduced: latest.current.reducedMotion });
  }, [props?.auto, warm]);

  // Preparing: the floors mount; the tour starts when frames run smoothly, or after a few seconds at most.
  useEffect(() => {
    if (state.status !== 'preparing') return;
    let smooth = 0;
    let last = performance.now();
    const began = last;
    let raf = 0;
    const step = (now: number) => {
      smooth = now - last < SMOOTH_MS ? smooth + 1 : 0;
      last = now;
      if (smooth >= SMOOTH_FRAMES || now - began >= WAIT_MS) dispatch({ type: 'ready', now });
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.status]);

  // Playing: the camera's frames carry the clock (see `pose`); this tick is the backstop when no frame runs.
  useEffect(() => {
    if (state.status !== 'playing') return;
    const every = setInterval(() => dispatch({ type: 'tick', now: performance.now() }), TICK_MS);
    return () => clearInterval(every);
  }, [state.status]);

  // Every input that is the person's hands on the scene ends it where the camera is; Esc lands on the start view.
  useEffect(() => {
    if (!active) return;
    const inside = (event: Event) => (event.target as Element | null)?.closest?.('[data-intro-ui]');
    const touch = (event: Event) => {
      if (!inside(event)) dispatch({ type: 'interrupt' });
    };
    const key = (event: KeyboardEvent) => {
      if (BARE_MODIFIERS.has(event.key)) return;
      if (event.key === 'Escape') dispatch({ type: 'skip', now: performance.now() });
      else if (!inside(event)) dispatch({ type: 'interrupt' });
    };
    const hidden = () => {
      if (document.hidden) dispatch({ type: 'abort' });
    };
    window.addEventListener('pointerdown', touch, true);
    window.addEventListener('touchstart', touch, { capture: true, passive: true });
    window.addEventListener('wheel', touch, { capture: true, passive: true });
    window.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('touchstart', touch, true);
      window.removeEventListener('wheel', touch, true);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [active]);

  // Choosing a member or asking for a place is the person taking over.
  const firstChoice = useRef(true);
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    dispatch({ type: 'interrupt' });
  }, [selectedId, focus]);

  useEffect(() => {
    if (state.status === 'done') latest.current.props?.onDone?.(state.outcome);
  }, [state]);

  const pose = useCallback((aspect: number): Pose | null => {
    const { state: s } = latest.current;
    if (!introActive(s)) return null;
    const now = performance.now();
    const t = introElapsed(s, now);
    // The camera's own frames are the clock: a phase changes the building the moment the pose says so.
    if (s.status === 'playing' && introSegmentAt(t, s.reduced)?.phase !== s.phase)
      dispatch({ type: 'tick', now });
    const { homeFloor: home, tiers: t6 } = frame.current;
    return introPoseAt(t, {
      aspect,
      tiers: t6,
      reduced: s.reduced,
      home: homePose(home, aspect),
    });
  }, []);

  const interrupt = useCallback(() => dispatch({ type: 'interrupt' }), []);
  const skip = useCallback(() => dispatch({ type: 'skip', now: performance.now() }), []);
  const replay = useCallback(
    () => dispatch({ type: 'start', reduced: latest.current.reducedMotion }),
    [],
  );
  const never = useCallback(() => {
    dispatch({ type: 'interrupt' });
    latest.current.props?.onNever?.();
  }, []);

  const segment = phase ? introSegments(reduced).find((s) => s.phase === phase) : undefined;
  const exploded = segment?.exploded ?? false;
  const drive = useMemo<IntroDrive | null>(
    () => (active ? { floor: phase === 'toStacked' ? homeFloor : FLOORS - 1, exploded } : null),
    [active, phase, homeFloor, exploded],
  );

  return {
    available: props !== undefined,
    active,
    drive,
    pose,
    dip: state.status === 'preparing' ? 'prepare' : segment?.dip ? phase : null,
    caption: active ? captionKeyOf(phase ?? 'orbit') : null,
    facts: { commits, tiers },
    interrupt,
    skip,
    replay,
    never,
  };
}

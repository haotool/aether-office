import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type RefObject,
} from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { tierCount } from '../core/crown-layout.js';
import { busiestFloor, floorCounts } from '../core/floor-counts.js';
import { FLOORS } from '../environment/layout.js';
import { OVERVIEW, fittedOffset, lookY } from '../scene/scene-geometry.js';
import type { Pose } from '../core/shot-camera.js';
import {
  introActive,
  introElapsed,
  introIdle,
  introReducer,
  type IntroOutcome,
} from './intro-machine.js';
import { introPoseAt, introSegmentAt, introSegments, type IntroPhase } from './intro-tour.js';
import { captionKeyOf, type IntroCaptionKey } from './intro-text.js';
import { useIntroClock, useIntroInterrupts } from './use-intro-inputs.js';

export type IntroProps = {
  auto: boolean;
  onDone?: (outcome: IntroOutcome) => void;
  onNever?: () => void;
};

type IntroDrive = { floor: number; exploded: boolean };

export type IntroTour = {
  available: boolean;
  active: boolean;
  drive: IntroDrive | null;
  pose: (aspect: number) => Pose | null;
  dip: string | null;
  caption: IntroCaptionKey | null;
  facts: { commits: number; tiers: number };
  interrupt: () => void;
  skip: () => void;
  replay: () => void;
  never: () => void;
};

const homePose = (floor: number, aspect: number): Pose => {
  const target: Pose['target'] = [0, lookY(floor, false), 0];
  const offset = fittedOffset(OVERVIEW(false), aspect);
  return {
    position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
    target,
    fov: 38,
  };
};

type IntroOptions = {
  props: IntroProps | undefined;
  warm: boolean;
  reducedMotion: boolean;
  agents: readonly Agent[];
  layout: Layout;
  commits: number;
  selectedId: string | null;
  focus: string;
};
type IntroDispatch = Dispatch<Parameters<typeof introReducer>[1]>;
type Latest = RefObject<{
  state: ReturnType<typeof introReducer>;
  props: IntroProps | undefined;
  reducedMotion: boolean;
}>;

function useAutoStart(
  props: IntroProps | undefined,
  warm: boolean,
  latest: Latest,
  dispatch: IntroDispatch,
) {
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!props?.auto || !warm || autoStarted.current || document.hidden) return;
    autoStarted.current = true;
    dispatch({ type: 'start', reduced: latest.current.reducedMotion });
  }, [props?.auto, warm, latest, dispatch]);
}

function useTakeOverOnChoice(selectedId: string | null, focus: string, dispatch: IntroDispatch) {
  const firstChoice = useRef(true);
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    dispatch({ type: 'interrupt' });
  }, [selectedId, focus, dispatch]);
}

function usePose(
  latest: Latest,
  frame: RefObject<{ homeFloor: number; tiers: number }>,
  dispatch: IntroDispatch,
) {
  return useCallback(
    (aspect: number): Pose | null => {
      const { state: s } = latest.current;
      if (!introActive(s)) return null;
      const now = performance.now();
      const t = introElapsed(s, now);
      if (s.status === 'playing' && introSegmentAt(t, s.reduced)?.phase !== s.phase)
        dispatch({ type: 'tick', now });
      const { homeFloor: home, tiers: t6 } = frame.current;
      return introPoseAt(t, {
        aspect,
        tiers: t6,
        reduced: s.reduced,
        home: homePose(home, aspect),
      });
    },
    [latest, frame, dispatch],
  );
}

function useControls(latest: Latest, dispatch: IntroDispatch) {
  const interrupt = useCallback(() => dispatch({ type: 'interrupt' }), [dispatch]);
  const skip = useCallback(() => dispatch({ type: 'skip', now: performance.now() }), [dispatch]);
  const replay = useCallback(
    () => dispatch({ type: 'start', reduced: latest.current.reducedMotion }),
    [latest, dispatch],
  );
  const never = useCallback(() => {
    dispatch({ type: 'interrupt' });
    latest.current.props?.onNever?.();
  }, [latest, dispatch]);
  return { interrupt, skip, replay, never };
}

export function useIntroTour({
  props,
  warm,
  reducedMotion,
  agents,
  layout,
  commits,
  selectedId,
  focus,
}: IntroOptions): IntroTour {
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

  useAutoStart(props, warm, latest, dispatch);
  useIntroClock(state.status, dispatch);
  useIntroInterrupts(active, dispatch);
  useTakeOverOnChoice(selectedId, focus, dispatch);
  useEffect(() => {
    if (state.status === 'done') latest.current.props?.onDone?.(state.outcome);
  }, [state]);
  const pose = usePose(latest, frame, dispatch);
  const controls = useControls(latest, dispatch);

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
    ...controls,
  };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from '@aether/contracts';
import type { PoseApi } from '../core/use-pose-cues.js';
import type { OfficeSceneProps } from '../scene/scene-props.js';
import { EMPTY_SQUAD, type SquadState } from './squad-model.js';
import { createHandover, type HandoverRuntime } from './handover/index.js';
import { buildFrame, type Plans, type SquadFrame, type View } from './squad-frame.js';
import { stepOnce, type Latest } from './squad-step.js';

export type { SquadEvent, SquadFrame } from './squad-frame.js';

const TICK_MS = 250;

type SquadSceneProps = Pick<
  OfficeSceneProps,
  'squads' | 'quality' | 'reducedMotion' | 'agents' | 'locale' | 'squadPrefs'
>;

const mirrorOf = (
  layout: Layout,
  { squads, quality, reducedMotion, agents, locale, squadPrefs }: SquadSceneProps,
  say: (line: string) => void,
) => ({
  layout,
  squads,
  agents,
  zh: locale === 'zh-TW',
  say,
  quality,
  reducedMotion,
  prefs: squadPrefs,
});

export function useSquad(
  layout: Layout,
  props: SquadSceneProps,
  say: (line: string) => void,
  pose: PoseApi['request'],
): SquadFrame {
  const { squads, quality, reducedMotion } = props;
  const enabled = squads !== undefined;
  const state = useRef<SquadState>(EMPTY_SQUAD);
  const [view, setView] = useState<View>({ state: EMPTY_SQUAD, now: 0, version: 0 });
  const handoverRef = useRef<HandoverRuntime | null>(null);
  handoverRef.current ??= createHandover();
  const handover = handoverRef.current;
  const plans = useRef<Plans>({ arrivals: new Map(), leaves: new Map() });
  const mirror = mirrorOf(layout, props, say);
  const latest = useRef<Latest>({ ...mirror, pose, view: null });
  Object.assign(latest.current, mirror);
  const order = useMemo(() => (squads ?? []).map((s) => s.supervisor), [squads]);

  const frame = useMemo(
    () =>
      buildFrame({
        layout,
        view,
        order,
        quality,
        reducedMotion,
        handover,
        plans: plans.current,
        state,
      }),
    [layout, view, order, quality, reducedMotion, handover],
  );
  latest.current.view = frame;

  useEffect(() => {
    if (!enabled) return;
    const step = () => stepOnce({ state, latest, plans: plans.current, handover, setView });
    step();
    const timer = setInterval(step, TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, squads, layout]);

  return enabled ? frame : { ...frame, layout };
}

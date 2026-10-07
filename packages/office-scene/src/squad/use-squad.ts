// The squads of a scene as React sees them: the state machine stepped on a clock, and what it implies for the floor (the
// zones, the pod seats, the walks). Everything drawn, and every seat lookup in the scene, reads the frame it returns.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from '@aether/contracts';
import type { PoseApi } from '../use-pose-cues.js';
import type { OfficeSceneProps } from '../scene-props.js';
import { EMPTY_SQUAD, type SquadState } from './squad-model.js';
import { createHandover, type HandoverRuntime } from './handover/index.js';
import { buildFrame, type Plans, type SquadFrame, type View } from './squad-frame.js';
import { stepOnce, type Latest } from './squad-step.js';

export type { SquadEvent, SquadFrame } from './squad-frame.js';

/** How often the state machine is looked at: arrivals, the pod hand-over and the shrink all wait on the clock. */
const TICK_MS = 250;

/**
 * Steps the squads and returns the frame. `squads` undefined turns the whole feature off: the layout comes back as it
 * was given, so the page without squads is exactly what it was. Who joins and who leaves is handed to `say` (the scene's
 * aria log), one sentence each, in the page's language.
 */
export function useSquad(
  layout: Layout,
  {
    squads,
    quality,
    reducedMotion,
    agents,
    locale,
    squadPrefs,
  }: Pick<
    OfficeSceneProps,
    'squads' | 'quality' | 'reducedMotion' | 'agents' | 'locale' | 'squadPrefs'
  >,
  say: (line: string) => void,
  pose: PoseApi['request'],
): SquadFrame {
  const enabled = squads !== undefined;
  const state = useRef<SquadState>(EMPTY_SQUAD);
  const [view, setView] = useState<View>({ state: EMPTY_SQUAD, now: 0, version: 0 });
  const handoverRef = useRef<HandoverRuntime | null>(null);
  handoverRef.current ??= createHandover();
  const handover = handoverRef.current;
  const plans = useRef<Plans>({ arrivals: new Map(), leaves: new Map() });
  const latest = useRef<Latest>({
    layout,
    squads,
    agents,
    zh: locale === 'zh-TW',
    say,
    pose,
    view: null,
    quality,
    reducedMotion,
    prefs: squadPrefs,
  });
  Object.assign(latest.current, {
    layout,
    squads,
    agents,
    zh: locale === 'zh-TW',
    say,
    quality,
    reducedMotion,
    prefs: squadPrefs,
  });
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

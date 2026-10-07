// The squads of a scene as React sees them: the state machine stepped on a clock, and what it implies for the floor (the
// zones, the pod seats, the walks). Everything drawn, and every seat lookup in the scene, reads the frame it returns.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from '@aether/contracts';
import { buildNavGrid, type Point } from '@aether/kernel';
import type { PoseApi } from '../use-pose-cues.js';
import type { OfficeSceneProps } from '../scene-props.js';
import {
  blockPods,
  leaveDuration,
  planArrival,
  planLeave,
  type Arrival,
  type Leave,
} from './errand.js';
import {
  EMPTY_SQUAD,
  occupies,
  stepSquad,
  type SquadMemberState,
  type SquadState,
} from './squad-model.js';
import { CHARACTER_BUDGET, drawSquads, type DrawSquad } from './squad-draw.js';
import { eventLine } from './squad-text.js';
import {
  createHandover,
  handoverLine,
  type HandoverRuntime,
  type HandoverPlan,
} from './handover/index.js';
import {
  placeZones,
  podSeats,
  withPodSeats,
  type PlacedZone,
  type PodSeat,
} from './squad-seats.js';

/** The nav grid of a floor with the pods other than the walker's own in the way. */
const gridFor = (layout: Layout, floor: number, seats: readonly PodSeat[], chair: Point) =>
  blockPods(
    buildNavGrid(layout.objects.filter((o) => (o.floor ?? 0) === floor)),
    seats.filter((s) => s.floor === floor),
    chair,
  );

/** How often the state machine is looked at: arrivals, the pod hand-over and the shrink all wait on the clock. */
const TICK_MS = 250;

/** Something that happened in a squad, for the text equivalent of the scene. */
export type SquadEvent = {
  kind: 'joined' | 'left';
  member: string;
  supervisor: string;
  type: string;
  at: number;
};

export type SquadFrame = {
  /** What the layers draw, per squad (see squad-draw.ts). */
  squads: readonly DrawSquad[];
  /** The page's layout plus a desk-like seat for every subagent in a pod: what the scene looks seats up in. */
  layout: Layout;
  zones: readonly PlacedZone[];
  seats: readonly PodSeat[];
  members: readonly SquadMemberState[];
  arrivals: ReadonlyMap<string, Arrival>;
  leaves: ReadonlyMap<string, Leave>;
  /** Members that finished and walk their result to the supervisor's desk on their way out (instead of a plain leave). */
  handovers: ReadonlyMap<string, HandoverPlan>;
  /** The hand-overs in progress and the in-trays (see handover/): the layer that draws them reads it every frame. */
  handover: HandoverRuntime;
  /** The live state, for the renderers' own per-frame reads (the rate, who works). */
  state: { readonly current: SquadState };
};

type View = { state: SquadState; now: number; version: number };

/** What a frame has to be rebuilt for: who is where, in which phase and doing what, and the zones' sizes. */
const signatureOf = (s: SquadState, now: number) =>
  Object.values(s.members)
    .map(
      (m) =>
        `${m.id}:${m.seat}:${m.phase}:${m.since}:${occupies(m, now)}:${+m.working}${+m.waiting}`,
    )
    .sort()
    .join('|') +
  '#' +
  Object.entries(s.zones)
    .map(([k, z]) => `${k}:${z.seats}`)
    .sort()
    .join('|');

function eventsOf(prev: SquadState, next: SquadState, now: number): SquadEvent[] {
  const out: SquadEvent[] = [];
  for (const m of Object.values(next.members)) {
    const before = prev.members[m.id];
    const joined = !before && m.phase === 'arriving';
    const left = m.phase === 'leaving' && before?.phase !== 'leaving';
    if (joined || left)
      out.push({
        kind: joined ? 'joined' : 'left',
        member: m.id,
        supervisor: m.supervisor,
        type: m.type,
        at: now,
      });
  }
  return out;
}

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
  const plans = useRef({ arrivals: new Map<string, Arrival>(), leaves: new Map<string, Leave>() });
  const latest = useRef({
    layout,
    squads,
    agents,
    zh: locale === 'zh-TW',
    say,
    pose,
    view: null as SquadFrame | null,
    quality,
    reducedMotion,
    prefs: squadPrefs,
  });
  latest.current.quality = quality;
  latest.current.reducedMotion = reducedMotion;
  latest.current.prefs = squadPrefs;
  latest.current.layout = layout;
  latest.current.squads = squads;
  latest.current.agents = agents;
  latest.current.zh = locale === 'zh-TW';
  latest.current.say = say;
  const order = useMemo(() => (squads ?? []).map((s) => s.supervisor), [squads]);

  const frame = useMemo<SquadFrame>(() => {
    const zones = placeZones(layout, view.state, order);
    const seats = podSeats(zones, view.state, view.now);
    const arrivals = new Map<string, Arrival>();
    for (const m of Object.values(view.state.members)) {
      const seat = seats.find((s) => s.member === m.id);
      if (m.phase !== 'arriving' || !seat) continue;
      const key = `${m.id}@${m.since}`;
      const chair = { x: seat.x, z: seat.z };
      const plan =
        plans.current.arrivals.get(key) ??
        planArrival(
          gridFor(layout, seat.floor, seats, chair),
          chair,
          (seat.rotation * Math.PI) / 2,
          quality,
          reducedMotion,
        );
      plans.current.arrivals.set(key, plan);
      arrivals.set(m.id, plan);
    }
    const leaves = new Map<string, Leave>();
    const handovers = new Map<string, HandoverPlan>();
    for (const m of Object.values(view.state.members)) {
      const leave = plans.current.leaves.get(`${m.id}@${m.since}`);
      const walk = handover.planOf(m.id, m.since);
      if (m.phase !== 'leaving') continue;
      if (walk?.mode === 'walk') handovers.set(m.id, walk);
      else if (leave) leaves.set(m.id, leave);
    }
    const live = new Set(Object.values(view.state.members).map((m) => `${m.id}@${m.since}`));
    for (const plan of [plans.current.arrivals, plans.current.leaves])
      for (const key of plan.keys()) if (!live.has(key)) plan.delete(key);
    const members = Object.values(view.state.members);
    return {
      squads: drawSquads({ zones, seats, members }, layout, CHARACTER_BUDGET[quality]),
      layout: withPodSeats(layout, seats),
      zones,
      seats,
      members,
      arrivals,
      leaves,
      handovers,
      handover,
      state,
    };
  }, [layout, view, order, quality, reducedMotion, handover]);
  latest.current.view = frame;

  useEffect(() => {
    if (!enabled) return;
    const step = () => {
      const now = Date.now();
      const prev = state.current;
      const seen = latest.current.view;
      const next = stepSquad(
        prev,
        {
          squads: latest.current.squads ?? [],
          // A member that starts to leave plans its way out from its pod as it is now: by the supervisor's desk, with its
          // result, when it finished and the hand-over is shown (see handover/), else straight to the core.
          leaveMs: (id, fact) => {
            const seat = seen?.seats.find((s) => s.member === id);
            if (!seat) return 0;
            const chair = { x: seat.x, z: seat.z };
            const frameYaw = (seat.rotation * Math.PI) / 2;
            const grid = gridFor(latest.current.layout, seat.floor, seen!.seats, chair);
            const squad = seen!.squads.find((s) => s.supervisor === seat.supervisor);
            const { quality: tier, reducedMotion: still, prefs } = latest.current;
            const plan =
              squad && fact?.status === 'finished'
                ? handover.begin({
                    id,
                    type: fact.type,
                    supervisor: seat.supervisor,
                    since: now,
                    result: fact.result,
                    squad,
                    chair,
                    frameYaw,
                    grid,
                    quality: tier,
                    reducedMotion: still,
                    calm: !!prefs?.calm,
                    relation: prefs?.relation !== false && prefs?.handover !== false,
                  })
                : null;
            if (plan?.mode === 'walk') return plan.t.total;
            const leave = planLeave(grid, chair, frameYaw);
            plans.current.leaves.set(`${id}@${now}`, leave);
            return leaveDuration(leave);
          },
        },
        now,
      );
      state.current = next;
      const { agents: named, zh, say: speak } = latest.current;
      const placed = handover.tick(now, {
        supervisors: new Set((seen?.squads ?? []).map((s) => s.supervisor)),
        members: new Set(Object.keys(next.members)),
      });
      for (const told of placed.told) speak(handoverLine(zh, told.type, told.kind));
      // What each supervisor does about a result put on its desk: it reads, then nods (or scratches its head at a flagged one).
      for (const c of placed.cues)
        latest.current.pose({ member: c.supervisor, source: 'handover', clip: c.clip });
      for (const event of eventsOf(prev, next, now))
        speak(
          eventLine(
            zh,
            event,
            named.find((a) => a.id === event.supervisor)?.name ?? event.supervisor,
          ),
        );
      const changed = placed.told.length > 0; // a folder reached a tray: draw it even when the seats did not change
      setView((old) =>
        !changed && signatureOf(old.state, old.now) === signatureOf(next, now)
          ? old
          : { state: next, now, version: old.version + 1 },
      );
    };
    step();
    const timer = setInterval(step, TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, squads, layout]);

  return enabled ? frame : { ...frame, layout };
}

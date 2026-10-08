// One look at the squads: the state machine stepped to now, the walks of whoever starts to leave, what is said about it.
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import type { PoseApi } from '../core/use-pose-cues.js';
import type { Quality } from '../scene/scene-types.js';
import type { SquadPrefs } from './SquadLayer.js';
import { leaveDuration, planLeave } from './errand.js';
import { stepSquad, type SquadInput, type SquadState } from './squad-model.js';
import { eventLine } from './squad-text.js';
import { handoverLine, type HandoverRuntime } from './handover/index.js';
import {
  eventsOf,
  gridFor,
  signatureOf,
  type Plans,
  type SquadFrame,
  type View,
} from './squad-frame.js';

/** What the clock reads each look: the page's latest props and the frame as last built, kept in a ref so the clock never restarts for them. */
export type Latest = {
  layout: Layout;
  squads: readonly SquadInput[] | undefined;
  agents: readonly Agent[];
  zh: boolean;
  say: (line: string) => void;
  pose: PoseApi['request'];
  view: SquadFrame | null;
  quality: Quality;
  reducedMotion: boolean;
  prefs: SquadPrefs | undefined;
};

type Stepper = {
  state: { current: SquadState };
  latest: RefObject<Latest>;
  plans: Plans;
  handover: HandoverRuntime;
  setView: Dispatch<SetStateAction<View>>;
};

type Fact = Parameters<NonNullable<Parameters<typeof stepSquad>[1]['leaveMs']>>[1];

/**
 * A member that starts to leave plans its way out from its pod as it is now: by the supervisor's desk, with its
 * result, when it finished and the hand-over is shown (see handover/), else straight to the core. Returns how long it takes.
 */
function planWayOut(s: Stepper, seen: SquadFrame | null, now: number, id: string, fact: Fact) {
  const seat = seen?.seats.find((p) => p.member === id);
  if (!seen || !seat) return 0;
  const { layout, quality, reducedMotion, prefs } = s.latest.current;
  const chair = { x: seat.x, z: seat.z };
  const frameYaw = (seat.rotation * Math.PI) / 2;
  const grid = gridFor(layout, seat.floor, seen.seats, chair);
  const squad = seen.squads.find((q) => q.supervisor === seat.supervisor);
  const plan =
    squad && fact?.status === 'finished'
      ? s.handover.begin({
          id,
          type: fact.type,
          supervisor: seat.supervisor,
          since: now,
          result: fact.result,
          squad,
          chair,
          frameYaw,
          grid,
          quality,
          reducedMotion,
          calm: !!prefs?.calm,
          relation: prefs?.relation !== false && prefs?.handover !== false,
        })
      : null;
  if (plan?.mode === 'walk') return plan.t.total;
  const leave = planLeave(grid, chair, frameYaw);
  s.plans.leaves.set(`${id}@${now}`, leave);
  return leaveDuration(leave);
}

/** Says what happened: folders that reached a tray, the supervisors' nods, who joined and who left. */
function announce(
  s: Stepper,
  seen: SquadFrame | null,
  prev: SquadState,
  next: SquadState,
  now: number,
) {
  const { agents, zh, say, pose } = s.latest.current;
  const placed = s.handover.tick(now, {
    supervisors: new Set((seen?.squads ?? []).map((q) => q.supervisor)),
    members: new Set(Object.keys(next.members)),
  });
  for (const told of placed.told) say(handoverLine(zh, told.type, told.kind));
  // What each supervisor does about a result put on its desk: it reads, then nods (or scratches its head at a flagged one).
  for (const c of placed.cues) pose({ member: c.supervisor, source: 'handover', clip: c.clip });
  for (const event of eventsOf(prev, next, now))
    say(
      eventLine(zh, event, agents.find((a) => a.id === event.supervisor)?.name ?? event.supervisor),
    );
  return placed.told.length > 0; // a folder reached a tray: draw it even when the seats did not change
}

/** The clock's one look: step the state to now, say what changed and, when the frame needs it, hand React a new view. */
export function stepOnce(s: Stepper) {
  const now = Date.now();
  const prev = s.state.current;
  const seen = s.latest.current.view;
  const next = stepSquad(
    prev,
    {
      squads: s.latest.current.squads ?? [],
      leaveMs: (id, fact) => planWayOut(s, seen, now, id, fact),
    },
    now,
  );
  s.state.current = next;
  const changed = announce(s, seen, prev, next, now);
  s.setView((old) =>
    !changed && signatureOf(old.state, old.now) === signatureOf(next, now)
      ? old
      : { state: next, now, version: old.version + 1 },
  );
}

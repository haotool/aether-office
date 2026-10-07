// The hand-over runtime of a scene: plans a hand-over when a subagent finishes, keeps the book, and moves it on with the
// clock. Plain objects, no React: use-squad.ts owns one and calls `begin` (when a member starts to leave) and `tick`.
import type { NavGrid, Point } from '@aether/kernel';
import { hashText } from '../../random.js';
import type { Quality } from '../../scene-types.js';
import type { DrawSquad } from '../squad-draw.js';
import {
  admit,
  advance,
  emptyBook,
  register,
  type Book,
  type Cue,
  type Live,
  type Told,
} from './book.js';
import { deskPlaces, routeHandover, timeline, type HandoverPlan } from './plan.js';
import { stampOf, type HandedResult } from './stamp.js';

/** What the layer that draws the scene says it shows: a hand-over is only walked for a desk that is in view. */
type View = { floor: number; exploded: boolean };

type HandoverStart = {
  id: string;
  type: string;
  supervisor: string;
  /** When the subagent finished. */
  since: number;
  result: HandedResult;
  squad: Pick<DrawSquad, 'floor' | 'x' | 'z' | 'deskX' | 'deskZ' | 'deskRotation' | 'side'>;
  /** The carrier's chair and the turn of its seat, on a grid with the other pods in the way. */
  chair: Point;
  frameYaw: number;
  grid: NavGrid;
  quality: Quality;
  reducedMotion: boolean;
  calm: boolean;
  relation: boolean;
};

const planKey = (id: string, since: number) => `${id}@${since}`;

export function createHandover() {
  let book: Book = emptyBook;
  const plans = new Map<string, HandoverPlan>();
  const view: { current: View | null } = { current: null };
  return {
    /** Written by the layer that draws the scene, each render. */
    view,
    /** The book, for the renderer's own per-frame reads. */
    book: () => book,
    /** The plan of the hand-over of a member that finished at `since`, if it has one. */
    planOf: (id: string, since: number) => plans.get(planKey(id, since)),
    /** Plans the hand-over of a subagent that has just finished; null when none is shown (the relation effects are off). */
    begin(s: HandoverStart): HandoverPlan | null {
      const desk = { x: s.squad.deskX, z: s.squad.deskZ, rotation: s.squad.deskRotation };
      const places = deskPlaces(desk, s.squad.side);
      const route = routeHandover(s.grid, s.chair, s.frameYaw, places);
      const shown = view.current;
      const decision = admit(
        book,
        {
          id: s.id,
          supervisor: s.supervisor,
          floor: s.squad.floor,
          since: s.since,
          walkMs: route.walkMs,
          inView: !shown || shown.exploded || shown.floor === s.squad.floor,
          quality: s.quality,
          still: s.reducedMotion || s.calm,
          relation: s.relation,
        },
        s.since,
      );
      if (!decision) return null;
      const plan: HandoverPlan = {
        mode: decision.mode,
        kind: stampOf(s.result),
        seed: hashText(planKey(s.id, s.since)),
        origin: s.chair,
        frameYaw: s.frameYaw,
        places,
        side: s.squad.side,
        route,
        t: timeline(decision.mode, decision.wait, route),
      };
      book = register(book, {
        id: s.id,
        supervisor: s.supervisor,
        floor: s.squad.floor,
        type: s.type,
        since: s.since,
        plan,
      });
      plans.set(planKey(s.id, s.since), plan);
      return plan;
    },
    /** Moves the book on to `now`; the cues are for the supervisors, the lines for the aria log. */
    tick(now: number, live: Live): { cues: Cue[]; told: Told[] } {
      const next = advance(book, now, live);
      book = next.book;
      const keys = new Set(Object.keys(book.entries));
      for (const key of plans.keys()) if (!keys.has(key)) plans.delete(key);
      return { cues: next.cues, told: next.told };
    },
  };
}

export type HandoverRuntime = ReturnType<typeof createHandover>;

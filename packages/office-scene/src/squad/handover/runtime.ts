import type { NavGrid, Point } from '@aether/kernel';
import { hashText } from '../../environment/hash.js';
import type { Quality } from '../../scene/scene-types.js';
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
import {
  deskPlaces,
  routeHandover,
  timeline,
  type DeskPlaces,
  type HandoverPlan,
  type Route,
} from './plan.js';
import { stampOf, type HandedResult } from './stamp.js';

type View = { floor: number; exploded: boolean };

type HandoverStart = {
  id: string;
  type: string;
  supervisor: string;
  since: number;
  result: HandedResult;
  squad: Pick<DrawSquad, 'floor' | 'x' | 'z' | 'deskX' | 'deskZ' | 'deskRotation' | 'side'>;
  chair: Point;
  frameYaw: number;
  grid: NavGrid;
  quality: Quality;
  reducedMotion: boolean;
  calm: boolean;
  relation: boolean;
};

const planKey = (id: string, since: number) => `${id}@${since}`;

function request(s: HandoverStart, route: Route, shown: View | null) {
  return {
    id: s.id,
    supervisor: s.supervisor,
    floor: s.squad.floor,
    since: s.since,
    walkMs: route.walkMs,
    inView: !shown || shown.exploded || shown.floor === s.squad.floor,
    quality: s.quality,
    still: s.reducedMotion || s.calm,
    relation: s.relation,
  };
}

function buildPlan(
  s: HandoverStart,
  decision: NonNullable<ReturnType<typeof admit>>,
  places: DeskPlaces,
  route: Route,
): HandoverPlan {
  return {
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
}

export function createHandover() {
  let book: Book = emptyBook;
  const plans = new Map<string, HandoverPlan>();
  const view: { current: View | null } = { current: null };
  return {
    view,
    book: () => book,
    planOf: (id: string, since: number) => plans.get(planKey(id, since)),
    begin(s: HandoverStart): HandoverPlan | null {
      const desk = { x: s.squad.deskX, z: s.squad.deskZ, rotation: s.squad.deskRotation };
      const places = deskPlaces(desk, s.squad.side);
      const route = routeHandover(s.grid, s.chair, s.frameYaw, places);
      const decision = admit(book, request(s, route, view.current), s.since);
      if (!decision) return null;
      const plan = buildPlan(s, decision, places, route);
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

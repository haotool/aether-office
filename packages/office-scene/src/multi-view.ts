import type { Agent } from '@aether/contracts';
import type { Seat, Shot } from './director.js';
import { hashText } from './hash.js';
import { valueOf } from './checked.js';

/**
 * The control-room wall: when several members are busy at once the main camera can only be on one of them, so the
 * others get a small live view each (a closeup at their desk) beside it. Which ones: the busiest working members the
 * main shot is not already on, that the scene is drawing (the floor on screen, or every floor when the building is
 * spread apart). A view that is still earning its place stays, so the wall does not reshuffle every few seconds.
 */
export const MAX_FEEDS = 4;
/** What the wall needs beside it: the floor card at the left, the margin at the right; a view is at least this wide. */
const WALL_CLEARANCE = 272;
const VIEW_MIN = 150;
const VIEW_GAP = 8;

/** Shorter than this the wall would sit on the floor switcher at the right of the canvas. */
const MIN_HEIGHT = 540;

/** How many views fit along the bottom of a canvas this size without covering the floor card or the floor switcher. */
export const feedCapacity = (width: number, height: number) =>
  height < MIN_HEIGHT
    ? 0
    : Math.max(
        0,
        Math.min(
          MAX_FEEDS,
          Math.floor((width - WALL_CLEARANCE + VIEW_GAP) / (VIEW_MIN + VIEW_GAP)),
        ),
      );

/** A rectangle in CSS pixels from the top left of the canvas. */
export type Rect = { x: number; y: number; width: number; height: number };
const WORKING: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
const WEIGHT: Partial<Record<Agent['activity'], number>> = {
  waiting_permission: 3,
  working: 2,
  reviewing: 2,
  waiting_peer: 1,
};

export type Feed = { id: string; shot: Shot };
const NONE: ReadonlySet<string> = new Set();

type FeedInput = {
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  intensity: ReadonlyMap<string, number>;
  /** Members already on the main screen or chosen by the person: not shown twice. */
  taken: ReadonlySet<string>;
  previous: readonly Feed[];
  /** The one floor the scene is drawing; leave out when it draws them all. A member elsewhere is not on screen. */
  floor?: number;
  max?: number;
  /** Members the person pinned to the wall: they always get a view (busy or not), before any other, as far as `max` allows. */
  pinned?: ReadonlySet<string>;
};

/** The busy members who need a view of their own, busiest first (ties by id). */
function busyIds(
  { agents, intensity, taken, pinned = NONE }: FeedInput,
  drawn: (id: string) => boolean,
): string[] {
  const busy = agents
    .filter(
      (a) =>
        (WORKING.includes(a.activity) || (intensity.get(a.id) ?? 0) > 0) &&
        drawn(a.id) &&
        !taken.has(a.id) &&
        !pinned.has(a.id),
    )
    .map((a) => ({
      id: a.id,
      score: (WEIGHT[a.activity] ?? 0) * 10 + (intensity.get(a.id) ?? 0) * 6,
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  // A single busy member is the main shot's business, not a wall's: it takes at least two to need one.
  return busy.length + taken.size >= 2 ? busy.map((b) => b.id) : [];
}

/** Each view stays in its slot and a newcomer takes a vacated one: a frame that moves in the page restarts its
 * power-on dip (see scene-pips.css), which blanks the picture for as long as the dip lasts. */
function inSlots(chosen: readonly string[], previous: readonly Feed[]): string[] {
  const chosenIds = new Set(chosen);
  const fresh = chosen.filter((id) => !previous.some((f) => f.id === id));
  const slots = previous.map((f) => (chosenIds.has(f.id) ? f.id : fresh.shift()));
  return [...slots, ...fresh].filter((id): id is string => !!id);
}

export function chooseFeeds(input: FeedInput): Feed[] {
  const { agents, seats, previous, floor, max = MAX_FEEDS, pinned = NONE } = input;
  const drawn = (id: string) =>
    seats.has(id) && (floor === undefined || seats.get(id)?.floor === floor);
  // A pinned member gets its view even when the main camera is on it: the person asked for that view.
  const pins = agents.filter((a) => pinned.has(a.id) && drawn(a.id)).map((a) => a.id);
  const keep = new Set(previous.map((f) => f.id));
  const wanted = busyIds(input, drawn);
  const chosen = [
    ...pins.filter((id) => keep.has(id)),
    ...pins.filter((id) => !keep.has(id)),
    ...wanted.filter((id) => keep.has(id)),
    ...wanted.filter((id) => !keep.has(id)),
  ].slice(0, max);
  return inSlots(chosen, previous).map((id) => {
    const seat = valueOf(seats, id);
    return {
      id,
      shot: {
        key: `feed:${id}`,
        kind: 'closeup',
        floor: seat.floor,
        subjects: [id],
        reason: 'working',
        seconds: 12,
        score: 0,
        style: (hashText(id) % 3) as 0 | 1 | 2,
      },
    };
  });
}

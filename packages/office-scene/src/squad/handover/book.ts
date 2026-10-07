// The book of hand-overs in progress: who is delivering what to which desk, which in-trays hold how many folders, what is
// to be said and what the supervisors do. Pure and immutable (each operation returns a new book): the runtime keeps one in
// a ref and the renderer reads it with the clock. The throttle lives here: one hand-over per member, two walkers per floor,
// one stamp at a time per desk, and a lower tier (or no motion) shows the same receipt with less.
import { between, seeded } from '../../random.js';
import type { Quality } from '../../scene-types.js';
import { STAND_MS } from '../../departure.js';
import { TURN_MS } from '../errand.js';
import {
  GLIDE_MS,
  POP_MS,
  PRESS_TOTAL_MS,
  TRAY_STACK_MAX,
  sealAt,
  type HandoverMode,
  type HandoverPlan,
} from './plan.js';
import type { StampKind } from './stamp.js';

/** At most this many carriers walk at once on one floor; the next ones show the folder popping into the tray. */
export const WALKERS_PER_FLOOR = 2;
/** The desk is given this long between one stamp and the next. */
export const DESK_GAP_MS = 400;
/** A carrier waits in its seat at most this long for the desk; past it the hand-over is shown as a pop. */
export const MAX_QUEUE_MS = 6000;
/** A folder that has to wait this long for the desk (a pop) is dropped into the tray at the desk's own pace, but no later than this. */
export const MAX_POP_WAIT_MS = 20_000;
/** A little spread on when each one stands, so two that finish together are not in lockstep. */
export const JITTER_MS = 300;
/** The in-tray's folders go after this long without a new one. */
export const TRAY_CLEAR_MS = 5 * 60_000;

export type Entry = {
  id: string;
  supervisor: string;
  floor: number;
  type: string;
  /** When the subagent finished (the plan's zero). */
  since: number;
  plan: HandoverPlan;
  /** 0: nothing yet; 1: placed (read and said); 2: stamped. */
  stage: 0 | 1 | 2;
};
export type Tray = { count: number; seal: Seal | null; lastAt: number };
export type Seal = { kind: StampKind; at: number; seed: number };
export type Book = {
  entries: Readonly<Record<string, Entry>>;
  trays: Readonly<Record<string, Tray>>;
};
export const emptyBook: Book = { entries: {}, trays: {} };

export type Request = {
  id: string;
  supervisor: string;
  floor: number;
  since: number;
  /** The time the carrier would take to walk to the desk, from the route. */
  walkMs: number;
  inView: boolean;
  quality: Quality;
  /** Reduced motion or Calm: the receipt without motion. */
  still: boolean;
  /** The relation effects are on. */
  relation: boolean;
};

const entryKey = (id: string, since: number) => `${id}@${since}`;
const end = (e: Entry) => e.since + e.plan.t.total;
const active = (book: Book) => Object.values(book.entries);

/** When the desk of a supervisor is next free for a stamp, as a wall-clock time. */
const deskFreeAt = (book: Book, supervisor: string, now: number) =>
  active(book)
    .filter((e) => e.supervisor === supervisor && e.plan.mode !== 'tray')
    .reduce(
      (free, e) => Math.max(free, e.since + e.plan.t.stampAt + PRESS_TOTAL_MS + DESK_GAP_MS),
      now,
    );

/**
 * Whether a hand-over is shown, how, and after how long a wait. Null: none (the relation effects are off, or this member
 * is already handing over). The mode steps down, never out: a receipt is always shown.
 */
export function admit(
  book: Book,
  req: Request,
  now: number,
): { mode: HandoverMode; wait: number } | null {
  if (!req.relation) return null;
  if (active(book).some((e) => e.id === req.id)) return null; // one hand-over per member
  if (req.still) return { mode: 'tray', wait: 0 };
  const walkers = active(book).filter(
    (e) => e.plan.mode === 'walk' && e.floor === req.floor && now < e.since + e.plan.t.placeAt,
  ).length;
  let mode: HandoverMode =
    req.quality === 'low' || !req.inView || walkers >= WALKERS_PER_FLOOR ? 'pop' : 'walk';
  const free = deskFreeAt(book, req.supervisor, now);
  const jitter = between(seeded(`${req.id}@${req.since}`), 0, JITTER_MS);
  const natural = (m: HandoverMode) =>
    m === 'walk' ? STAND_MS + req.walkMs + TURN_MS + GLIDE_MS : POP_MS;
  let wait = Math.max(0, free - now - natural(mode));
  if (mode === 'walk' && wait > MAX_QUEUE_MS) {
    mode = 'pop';
    wait = Math.max(0, free - now - natural(mode));
  }
  return { mode, wait: Math.min(MAX_POP_WAIT_MS, wait + (mode === 'walk' ? jitter : 0)) };
}

/** Puts a planned hand-over in the book (the plan's zero is `since`). */
export function register(book: Book, entry: Omit<Entry, 'stage'>): Book {
  return {
    ...book,
    entries: { ...book.entries, [entryKey(entry.id, entry.since)]: { ...entry, stage: 0 } },
  };
}

/** A supervisor's reaction to what was put on its desk. */
export type Cue = { supervisor: string; clip: 'reading' | 'nod' | 'scratch_head' };
/** A hand-over that has just been placed in the tray: one line for the aria log. */
export type Told = { id: string; supervisor: string; type: string; kind: StampKind };

/** What is alive in the scene: a hand-over of a supervisor that is gone, or of a carrier that vanished, is cut short. */
export type Live = { supervisors: ReadonlySet<string>; members: ReadonlySet<string> };

/**
 * Moves the book on to `now`: the supervisor reads when a folder is placed and nods (or, for a flagged result, scratches
 * its head) when the stamp falls; a finished hand-over folds into its tray. A hand-over whose supervisor is gone is dropped
 * with its tray. One whose carrier vanished with the folder still in its hands is dropped too, with no stamp and no line:
 * the receipt only exists when a folder reached the desk.
 */
export function advance(
  book: Book,
  now: number,
  live: Live,
): { book: Book; cues: Cue[]; told: Told[] } {
  const cues: Cue[] = [];
  const told: Told[] = [];
  const entries: Record<string, Entry> = {};
  const trays: Record<string, Tray> = {};
  for (const [supervisor, tray] of Object.entries(book.trays))
    if (live.supervisors.has(supervisor)) trays[supervisor] = tray;
  const ordered = active(book).sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));
  for (const e of ordered) {
    const elapsed = now - e.since;
    const t = e.plan.t;
    const dropped =
      !live.supervisors.has(e.supervisor) ||
      (e.plan.mode === 'walk' && !live.members.has(e.id) && elapsed < t.placeAt);
    if (dropped) continue;
    let stage = e.stage;
    if (stage < 1 && elapsed >= t.placeAt) {
      stage = 1;
      told.push({ id: e.id, supervisor: e.supervisor, type: e.type, kind: e.plan.kind });
      if (e.plan.mode !== 'tray') cues.push({ supervisor: e.supervisor, clip: 'reading' });
    }
    if (stage < 2 && elapsed >= t.stampAt) {
      stage = 2;
      if (e.plan.mode !== 'tray')
        cues.push({
          supervisor: e.supervisor,
          clip: e.plan.kind === 'returned' ? 'scratch_head' : 'nod',
        });
    }
    if (now >= end(e)) {
      const tray = trays[e.supervisor] ?? { count: 0, seal: null, lastAt: now };
      trays[e.supervisor] = {
        count: Math.min(TRAY_STACK_MAX, tray.count + 1),
        seal: { kind: e.plan.kind, at: e.since + sealAt(e.plan), seed: e.plan.seed },
        lastAt: now,
      };
      continue;
    }
    entries[entryKey(e.id, e.since)] = stage === e.stage ? e : { ...e, stage };
  }
  const idle = new Set(Object.values(entries).map((e) => e.supervisor));
  for (const [supervisor, tray] of Object.entries(trays))
    if (!idle.has(supervisor) && now - tray.lastAt > TRAY_CLEAR_MS) delete trays[supervisor];
  return { book: { entries, trays }, cues, told };
}

/** What a supervisor's in-tray shows now: the folders stacked (placed ones included) and the last seal. */
export function trayView(
  book: Book,
  supervisor: string,
  now: number,
): { count: number; seal: Seal | null } {
  const tray = book.trays[supervisor];
  const mine = active(book).filter((e) => e.supervisor === supervisor);
  const placed = mine.filter((e) => now - e.since >= e.plan.t.placeAt);
  const stamped = placed
    .filter((e) => now - e.since >= sealAt(e.plan))
    .sort((a, b) => b.since + sealAt(b.plan) - (a.since + sealAt(a.plan)))[0];
  return {
    count: Math.min(TRAY_STACK_MAX, (tray?.count ?? 0) + placed.length),
    seal: stamped
      ? {
          kind: stamped.plan.kind,
          at: stamped.since + sealAt(stamped.plan),
          seed: stamped.plan.seed,
        }
      : (tray?.seal ?? null),
  };
}

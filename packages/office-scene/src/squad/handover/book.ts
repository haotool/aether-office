import { between } from '../../environment/pick.js';
import { seeded } from '../../environment/seeded.js';
import type { Quality } from '../../scene/scene-types.js';
import { STAND_MS } from '../../animals/departure.js';
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
export const DESK_GAP_MS = 400;
/** A carrier waits in its seat at most this long for the desk; past it the hand-over is shown as a pop. */
export const MAX_QUEUE_MS = 6000;
const MAX_POP_WAIT_MS = 20_000;
export const JITTER_MS = 300;
export const TRAY_CLEAR_MS = 5 * 60_000;

type Entry = {
  id: string;
  supervisor: string;
  floor: number;
  type: string;
  since: number;
  plan: HandoverPlan;
  stage: 0 | 1 | 2;
};
type Tray = { count: number; seal: Seal | null; lastAt: number };
type Seal = { kind: StampKind; at: number; seed: number };
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
  walkMs: number;
  inView: boolean;
  quality: Quality;
  still: boolean;
  relation: boolean;
};

const entryKey = (id: string, since: number) => `${id}@${since}`;
const end = (e: Entry) => e.since + e.plan.t.total;
const active = (book: Book) => Object.values(book.entries);

const deskFreeAt = (book: Book, supervisor: string, now: number) =>
  active(book)
    .filter((e) => e.supervisor === supervisor && e.plan.mode !== 'tray')
    .reduce(
      (free, e) => Math.max(free, e.since + e.plan.t.stampAt + PRESS_TOTAL_MS + DESK_GAP_MS),
      now,
    );

/** The mode steps down, never out: a receipt is always shown. */
export function admit(
  book: Book,
  req: Request,
  now: number,
): { mode: HandoverMode; wait: number } | null {
  if (!req.relation) return null;
  if (active(book).some((e) => e.id === req.id)) return null;
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

export function register(book: Book, entry: Omit<Entry, 'stage'>): Book {
  return {
    ...book,
    entries: { ...book.entries, [entryKey(entry.id, entry.since)]: { ...entry, stage: 0 } },
  };
}

export type Cue = { supervisor: string; clip: 'reading' | 'nod' | 'scratch_head' };
export type Told = { id: string; supervisor: string; type: string; kind: StampKind };

export type Live = { supervisors: ReadonlySet<string>; members: ReadonlySet<string> };

const handoverDropped = (e: Entry, elapsed: number, live: Live) =>
  !live.supervisors.has(e.supervisor) ||
  (e.plan.mode === 'walk' && !live.members.has(e.id) && elapsed < e.plan.t.placeAt);

function advanceStages(e: Entry, elapsed: number, cues: Cue[], told: Told[]): Entry['stage'] {
  let stage: Entry['stage'] = e.stage;
  const t = e.plan.t;
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
  return stage;
}

function stackFinishedEntry(trays: Record<string, Tray>, e: Entry, now: number) {
  const tray = trays[e.supervisor] ?? { count: 0, seal: null, lastAt: now };
  trays[e.supervisor] = {
    count: Math.min(TRAY_STACK_MAX, tray.count + 1),
    seal: { kind: e.plan.kind, at: e.since + sealAt(e.plan), seed: e.plan.seed },
    lastAt: now,
  };
}

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
    if (handoverDropped(e, elapsed, live)) continue;
    const stage = advanceStages(e, elapsed, cues, told);
    if (now >= end(e)) {
      stackFinishedEntry(trays, e, now);
      continue;
    }
    entries[entryKey(e.id, e.since)] = stage === e.stage ? e : { ...e, stage };
  }
  const idle = new Set(Object.values(entries).map((entry) => entry.supervisor));
  for (const [supervisor, tray] of Object.entries(trays))
    if (!idle.has(supervisor) && now - tray.lastAt > TRAY_CLEAR_MS) delete trays[supervisor];
  return { book: { entries, trays }, cues, told };
}

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

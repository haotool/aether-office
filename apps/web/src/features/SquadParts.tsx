import { useSyncExternalStore } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { elapsedLabel, type SquadRow } from './feed-squads.js';

/** One timer for every running subagent's clock: a row re-renders by itself once a second, the rest of the feed never. */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let beat = 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    beat++;
    for (const l of listeners) l();
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const noSubscribe = () => () => undefined;
const getBeat = () => beat;

/** How long a subagent has run: ticking while it runs, fixed once it ended. Hidden from assistive tech (it only counts up). */
export function Elapsed({ row }: { row: Pick<SquadRow, 'startedAt' | 'endedAt' | 'status'> }) {
  const ticking = row.endedAt === null && row.status !== 'finished';
  useSyncExternalStore(ticking ? subscribe : noSubscribe, getBeat);
  const text = elapsedLabel(row, Date.now());
  return (
    text && (
      <span className="sub-elapsed" aria-hidden="true">
        {text}
      </span>
    )
  );
}

/** The status as a colored dot (the words next to it say the same; the dot alone is never the only cue). */
export const SubDot = ({ status }: { status: SquadRow['status'] }) => (
  <i className="sub-dot" data-status={status} aria-hidden="true" />
);

/** Two rows that show the same thing: lets a memoized row skip a render when a poll brings the same facts again. */
export function sameRow(a: SquadRow, b: SquadRow): boolean {
  return (Object.keys(a) as (keyof SquadRow)[]).every((k) => a[k] === b[k]);
}

/** The relation to the supervisor ("subagent of main", "Spawned by main") as a chip; pressing it selects the supervisor. */
export function RelationChip({
  text,
  hue,
  onOpen,
}: {
  text: string;
  hue: number;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="relation-chip" data-squad={hue} onClick={onOpen}>
      <CornerUpLeft size={12} aria-hidden="true" />
      {text}
    </button>
  );
}

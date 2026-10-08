import type { Seat } from '@aether/office-scene/model';

// The desks of one project's observed members, remembered in the browser so a reload seats the same people where they sat.
// Only session ids and two integers per member are stored; anything unreadable is ignored (the desks are then simply
// assigned afresh).
const VERSION = 1;
export const MAX_SEATS = 512;
const key = (projectId: string) => `aether-seats:${projectId}`;

export function parseSeats(raw: string | null): Map<string, Seat> {
  const out = new Map<string, Seat>();
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const rows = (parsed as { v?: unknown; seats?: unknown } | null)?.seats;
    if ((parsed as { v?: unknown } | null)?.v !== VERSION || !Array.isArray(rows)) return out;
    for (const row of rows.slice(-MAX_SEATS)) {
      const [id, floor, slot] = row as unknown[];
      if (typeof id === 'string' && Number.isInteger(floor) && Number.isInteger(slot))
        out.set(id, [floor as number, slot as number]);
    }
  } catch {
    return new Map();
  }
  return out;
}

/** The last MAX_SEATS entries, as the text that is stored (a map of the members present stays far below it). */
export function serializeSeats(seats: ReadonlyMap<string, Seat>): string {
  const rows = [...seats].slice(-MAX_SEATS).map(([id, [floor, slot]]) => [id, floor, slot]);
  return JSON.stringify({ v: VERSION, seats: rows });
}

export function loadSeats(projectId: string): Map<string, Seat> {
  try {
    return parseSeats(window.localStorage.getItem(key(projectId)));
  } catch {
    return new Map();
  }
}

export function saveSeats(projectId: string, seats: ReadonlyMap<string, Seat>) {
  try {
    window.localStorage.setItem(key(projectId), serializeSeats(seats));
  } catch {
    // Storage is full or blocked: the desks stay stable for this visit only.
  }
}

// Only counters, the model name and timestamps are read; no message text is decoded, kept or returned.
import { parseClaude, type Claims } from './usage-claude.js';
import { parseCodex } from './usage-codex.js';
import type { DayOf, ParseState } from './usage-counters.js';

export function parseChunk(state: ParseState, data: Buffer, dayOf: DayOf, claims?: Claims): void {
  if (state.provider === 'claude') parseClaude(state, data, dayOf, claims);
  else parseCodex(state, data, dayOf);
}

export function dayKeyOf(timeZone: string): DayOf {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const memo = new Map<number, string>();
  return (ms) => {
    const slot = Math.floor(ms / 900_000);
    let day = memo.get(slot);
    if (day === undefined) {
      day = format.format(slot * 900_000);
      if (memo.size > 4096) memo.clear();
      memo.set(slot, day);
    }
    return day;
  };
}

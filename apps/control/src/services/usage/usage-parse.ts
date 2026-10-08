// Token counters out of provider transcripts, incrementally: `parseChunk` takes whole lines appended since the last call
// and adds them to a per-file state holding one bucket per local calendar day. Only counters, the model name and
// timestamps are read; no message text is decoded, kept or returned. Nothing is decoded but the few hundred bytes around
// a record's counters (most of a transcript is tool output).
import { parseClaude, type Claims } from './usage-claude.js';
import { parseCodex } from './usage-codex.js';
import type { DayOf, ParseState } from './usage-counters.js';

/** Adds the whole lines of `data` (appended since the last call) to `state`. */
export function parseChunk(state: ParseState, data: Buffer, dayOf: DayOf, claims?: Claims): void {
  if (state.provider === 'claude') parseClaude(state, data, dayOf, claims);
  else parseCodex(state, data, dayOf);
}

/** The local calendar day of an instant in `timeZone`, remembered per quarter hour so each event costs a lookup. */
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

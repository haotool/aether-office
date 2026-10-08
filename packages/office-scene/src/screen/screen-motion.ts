import { MEMO_LIMIT, memoized } from '../environment/memo.js';
import { between } from '../environment/pick.js';
import { memberRng } from './screen-seed.js';
import { lineText, type CodeLine } from './screen-tokens.js';
import { itemAt } from '../environment/checked.js';

/**
 * Time on a desk screen, as pure functions of (seed, time): how fast a member types and when it stops, which lines of the
 * file it is working in, where the view scrolls. The screen painter samples these a few times a second; the same
 * seed and moment always give the same answer, so what is drawn never depends on when the screen was last painted.
 */
type Segment = { ms: number; cps: number };

/**
 * One member's typing rhythm, as a cycle that repeats: bursts of a few seconds in short strokes (a word, a small
 * breath, a word at a slightly different speed), each followed by a pause to look at the screen.
 */
const typingCycleOf = (seed: string) => {
  const r = memberRng(seed, 'typing');
  const base = between(r, 5, 8); // this member's own speed, characters per second
  const segments: Segment[] = [];
  for (let burst = 0; burst < 7; burst++) {
    for (let t = 0, span = between(r, 1.4, 4.2); t < span;) {
      const stroke = between(r, 0.25, 0.8);
      segments.push({ ms: stroke * 1000, cps: base * between(r, 0.7, 1.35) });
      segments.push({ ms: between(r, 60, 220), cps: 0 }); // between two words
      t += stroke + 0.14;
    }
    segments.push({ ms: between(r, 700, 2800), cps: 0 }); // a look at the screen
  }
  const length = segments.reduce((sum, s) => sum + s.ms, 0);
  const chars = segments.reduce((sum, s) => sum + (s.ms * s.cps) / 1000, 0);
  return { segments, length, chars };
};
const cycles = new Map<string, ReturnType<typeof typingCycleOf>>();
export const typingCycle = memoized(cycles, MEMO_LIMIT, typingCycleOf);

/** How many characters a member has typed `ms` after it began, at `speed` times its own pace (1 to 2 as it works harder). */
export function typedChars(seed: string, ms: number, speed = 1): number {
  const { segments, length, chars } = typingCycle(seed);
  const scaled = ms * speed;
  let rest = scaled % length;
  let total = Math.floor(scaled / length) * chars;
  for (const s of segments) {
    if (rest <= s.ms) return Math.floor(total + (rest * s.cps) / 1000);
    total += (s.ms * s.cps) / 1000;
    rest -= s.ms;
  }
  return Math.floor(total);
}

const BLINK_MS = 1060;
/** The caret is lit for the first part of each blink period. */
export const caretOn = (ms: number): boolean => ms % BLINK_MS < 640;

type Hunk = { start: number; length: number };

/** The few places in a file a member edits, in order and apart from each other. */
export function hunksOf(lines: readonly CodeLine[], seed: string, file: string): Hunk[] {
  const r = memberRng(seed, `${file}:hunks`);
  const count = 3 + Math.floor(r() * 2);
  const slot = Math.floor(lines.length / count);
  return Array.from({ length: count }, (_, i) => {
    const length = 4 + Math.floor(r() * 4);
    const start = i * slot + 1 + Math.floor(r() * Math.max(1, slot - length - 2));
    return { start, length: Math.min(length, lines.length - start) };
  });
}

export type EditAt = { hunk: number; line: number; column: number; done: number };

/** Where the typing is after `chars` characters: the hunk, the line and column of the caret, and how many hunk lines are complete. */
export function editPosition(
  lines: readonly CodeLine[],
  hunks: readonly Hunk[],
  chars: number,
): EditAt {
  const sizes = hunks.map((h) =>
    lines.slice(h.start, h.start + h.length).reduce((sum, l) => sum + lineText(l).length + 1, 0),
  );
  let rest = chars % sizes.reduce((a, b) => a + b, 0);
  for (const [hunk, size] of sizes.entries()) {
    if (rest >= size) {
      rest -= size;
      continue;
    }
    const h = itemAt(hunks, hunk);
    for (let done = 0; done < h.length; done++) {
      const width = lineText(itemAt(lines, h.start + done)).length + 1;
      if (rest < width) return { hunk, line: h.start + done, column: rest, done };
      rest -= width;
    }
  }
  return { hunk: 0, line: itemAt(hunks, 0).start, column: 0, done: 0 };
}

/** One step of easing toward a target: a fraction of the distance, so a scroll starts fast and settles (and never overshoots). */
export function easeToward(current: number, target: number, ms: number, tauMs = 240): number {
  return current + (target - current) * (1 - Math.exp(-ms / tauMs));
}

const READ_BUCKET_MS = 4200;
/** Where a reader's view rests (0 to `max`): it moves on every few seconds, by a different amount each time. */
export function readTarget(seed: string, ms: number, max: number): number {
  const bucket = Math.floor(ms / READ_BUCKET_MS);
  const r = memberRng(seed, `read:${bucket}`);
  return Math.floor(((bucket * 0.23 + r() * 0.4) % 1) * max);
}

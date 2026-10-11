import { MEMO_LIMIT, memoized } from '../environment/memo.js';
import { between } from '../environment/pick.js';
import { memberRng } from './screen-seed.js';
import { lineText, type CodeLine } from './screen-tokens.js';
import { itemAt } from '../environment/checked.js';

type Segment = { ms: number; cps: number };

const typingCycleOf = (seed: string) => {
  const r = memberRng(seed, 'typing');
  const base = between(r, 5, 8);
  const segments: Segment[] = [];
  for (let burst = 0; burst < 7; burst++) {
    for (let t = 0, span = between(r, 1.4, 4.2); t < span;) {
      const stroke = between(r, 0.25, 0.8);
      segments.push({ ms: stroke * 1000, cps: base * between(r, 0.7, 1.35) });
      segments.push({ ms: between(r, 60, 220), cps: 0 });
      t += stroke + 0.14;
    }
    segments.push({ ms: between(r, 700, 2800), cps: 0 });
  }
  const length = segments.reduce((sum, s) => sum + s.ms, 0);
  const chars = segments.reduce((sum, s) => sum + (s.ms * s.cps) / 1000, 0);
  return { segments, length, chars };
};
const cycles = new Map<string, ReturnType<typeof typingCycleOf>>();
export const typingCycle = memoized(cycles, MEMO_LIMIT, typingCycleOf);

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
export const caretOn = (ms: number): boolean => ms % BLINK_MS < 640;

type Hunk = { start: number; length: number };

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

export function easeToward(current: number, target: number, ms: number, tauMs = 240): number {
  return current + (target - current) * (1 - Math.exp(-ms / tauMs));
}

const READ_BUCKET_MS = 4200;
export function readTarget(seed: string, ms: number, max: number): number {
  const bucket = Math.floor(ms / READ_BUCKET_MS);
  const r = memberRng(seed, `read:${bucket}`);
  return Math.floor(((bucket * 0.23 + r() * 0.4) % 1) * max);
}

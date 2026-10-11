export type ScheduleSpec =
  | { kind: 'once'; at: number }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; days: readonly number[]; time: string };

const DEFAULT_TIMEZONE = 'Asia/Taipei';
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
import { DAY_MS } from './time.js';

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidSpec(spec: ScheduleSpec): boolean {
  if (spec.kind === 'once') return Number.isSafeInteger(spec.at) && spec.at > 0;
  if (!TIME.test(spec.time)) return false;
  if (spec.kind === 'daily') return true;
  return spec.days.length > 0 && spec.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function partsOf(utc: number, tz: string): Parts {
  const get = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(utc);
  const part = (type: string) => get.find((p) => p.type === type)?.value ?? '';
  const n = (type: string) => Number(part(type));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
    weekday,
  };
}

function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = new Set<number>();
  for (const probe of [guess - DAY_MS, guess + DAY_MS]) {
    const p = partsOf(probe, tz);
    const offset =
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(probe / 60000) * 60000;
    candidates.add(guess - offset);
  }
  const valid = [...candidates].filter((utc) => {
    const p = partsOf(utc, tz);
    return (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    );
  });
  return valid.length ? Math.min(...valid) : null;
}

export function nextRun(
  spec: ScheduleSpec,
  after: number,
  tz: string = DEFAULT_TIMEZONE,
): number | null {
  if (spec.kind === 'once') return spec.at > after ? spec.at : null;
  const [hour, minute] = spec.time.split(':').map(Number) as [number, number];
  const today = partsOf(after, tz);
  for (let offset = 0; offset <= 370; offset++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = date.getUTCDay();
    if (spec.kind === 'weekly' && !spec.days.includes(weekday)) continue;
    const utc = zonedToUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      hour,
      minute,
      tz,
    );
    if (utc !== null && utc > after) return utc;
  }
  return null;
}

/** At most one occurrence is ever dispatched, so a long outage cannot create a burst of catch-up work. */
export function dueDecision(
  spec: ScheduleSpec,
  tz: string,
  dueAt: number,
  now: number,
  missed: 'skip' | 'single',
  graceMs = 60_000,
): { dispatch: boolean; occurrence: number; nextAt: number | null } {
  let latest = dueAt;
  for (
    let next = nextRun(spec, latest, tz);
    next !== null && next <= now;
    next = nextRun(spec, latest, tz)
  )
    latest = next;
  const nextAt = nextRun(spec, now, tz);
  return { dispatch: missed === 'single' || now - latest < graceMs, occurrence: latest, nextAt };
}

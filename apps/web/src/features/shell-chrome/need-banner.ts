import type { LocalSession } from '@aether/contracts';
import { formatSpan } from '@aether/kernel';
import { activityOf } from '../../lib/sessions/session-attention.js';

export const REMIND_EVERY_MS = 30_000;
const MINUTE_MS = 60_000;

export type Ask = { key: string; label: string; since: number; detail: string };
type Banner = { key: string; label: string; detail: string; waited: string; more: number };

export function asksOf(
  sessions: readonly LocalSession[] | undefined,
  asking: ReadonlySet<string>,
  label: (session: LocalSession) => string,
  now: number,
): Ask[] {
  return (sessions ?? [])
    .filter((s) => activityOf(s, now) === 'waiting_permission' || asking.has(s.key))
    .map((s) => ({
      key: s.key,
      label: label(s),
      since: s.hook?.at ?? s.mtime,
      detail: s.hook?.tool ?? '',
    }))
    .sort((a, b) => a.since - b.since);
}

export function bannerOf(asks: readonly Ask[], now: number, locale: 'zh-TW' | 'en'): Banner | null {
  const [first] = asks;
  if (!first) return null;
  const waited = now - first.since;
  return {
    key: first.key,
    label: first.label,
    detail: first.detail,
    waited: waited < MINUTE_MS ? '' : formatSpan(waited, locale),
    more: asks.length - 1,
  };
}

export const freshAsks = (seen: ReadonlySet<string>, asks: readonly Ask[]): Ask[] =>
  asks.filter((a) => !seen.has(a.key));

export const reminderDue = (
  asks: readonly Ask[],
  unattended: boolean,
  lastRang: number,
  now: number,
): boolean => asks.length > 0 && unattended && now - lastRang >= REMIND_EVERY_MS;

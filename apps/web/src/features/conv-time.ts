import type { Locale } from '../i18n.js';

/** Pure. How old a moment is, in the words a conversation uses, and which day it belongs to. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "just now" for the last minute, "3 min ago" for the rest of the hour; null once a clock time says it better. */
export function relativeAgo(at: number | null, now: number, locale: Locale): string | null {
  if (at === null) return null;
  const age = now - at;
  if (age >= HOUR) return null;
  if (age < MINUTE) return locale === 'zh-TW' ? '剛剛' : 'just now';
  const minutes = Math.floor(age / MINUTE);
  return locale === 'zh-TW' ? `${minutes} 分鐘前` : `${minutes} min ago`;
}

const dayStart = (at: number) => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
export const sameDay = (a: number, b: number) => dayStart(a) === dayStart(b);

/** "Today", "Yesterday" or the date, for the line that separates one day's messages from the next. */
export function dayLabel(at: number, now: number, locale: Locale): string {
  const zh = locale === 'zh-TW';
  const days = Math.round((dayStart(now) - dayStart(at)) / (24 * HOUR));
  if (days === 0) return zh ? '今天' : 'Today';
  if (days === 1) return zh ? '昨天' : 'Yesterday';
  return new Date(at).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(new Date(at).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}

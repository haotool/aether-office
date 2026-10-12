import { DAY_MS, HOUR_MS, formatAgo } from '@aether/kernel';
import { translate, type Locale } from '../../lib/i18n/i18n.js';

export function relativeAgo(at: number | null, now: number, locale: Locale): string | null {
  if (at === null) return null;
  const age = now - at;
  return age >= HOUR_MS ? null : formatAgo(Math.max(0, age), locale);
}

const dayStart = (at: number) => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
export const sameDay = (a: number, b: number) => dayStart(a) === dayStart(b);

export function dayLabel(at: number, now: number, locale: Locale): string {
  const days = Math.round((dayStart(now) - dayStart(at)) / DAY_MS);
  if (days === 0) return translate(locale, 'dayToday');
  if (days === 1) return translate(locale, 'dayYesterday');
  return new Date(at).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(new Date(at).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}

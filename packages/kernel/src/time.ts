/** Pure. The one place durations are named and spoken: a span ("3 min"), and how long ago ("3 min ago"). */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

type Lang = 'zh-TW' | 'en';

/** A span of time as a person reads it: "3 分鐘", "14 小時", "2 天". Rounded down, never zero. */
export function formatSpan(ms: number, locale: Lang = 'zh-TW'): string {
  const minutes = Math.max(1, Math.floor(ms / MINUTE_MS));
  const [n, zh, en] =
    minutes < 60
      ? [minutes, '分鐘', 'min']
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), '小時', 'h']
        : [Math.floor(minutes / 1440), '天', 'd'];
  return locale === 'zh-TW' ? `${n} ${zh}` : `${n} ${en}`;
}

/** "剛剛" / "just now" for the last minute, then "3 分鐘前" / "3 min ago". */
export function formatAgo(ms: number, locale: Lang = 'zh-TW'): string {
  if (ms < MINUTE_MS) return locale === 'zh-TW' ? '剛剛' : 'just now';
  return locale === 'zh-TW' ? `${formatSpan(ms, locale)}前` : `${formatSpan(ms, locale)} ago`;
}

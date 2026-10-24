import { useEffect, useRef } from 'react';
import { useLatest } from '../../hooks/use-latest.js';
import { chime } from '../../lib/notifications/chime.js';
import { freshAsks, reminderDue, type Ask } from './need-banner.js';

const CHECK_MS = 5_000;

export function useNeedAlarm(asks: readonly Ask[], enabled: boolean) {
  const seen = useRef<ReadonlySet<string> | null>(null);
  const lastRang = useRef(Date.now());
  const latest = useLatest(asks);
  useEffect(() => {
    const first = seen.current === null;
    const fresh = freshAsks(seen.current ?? new Set(), asks);
    seen.current = new Set(asks.map((a) => a.key));
    if (!enabled || first || !fresh.length) return;
    chime();
    lastRang.current = Date.now();
  }, [asks, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const away = document.hidden || !document.hasFocus();
      if (!reminderDue(latest.current, away, lastRang.current, now)) return;
      chime();
      lastRang.current = now;
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [enabled, latest]);
}

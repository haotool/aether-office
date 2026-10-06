import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePreferences } from '../state.js';
import { dayLabel, relativeAgo } from './conv-time.js';

const TICK_MS = 30_000;
const NowContext = createContext(Date.now());

/** The clock the conversation's relative times read: one timer for all of them, ticking twice a minute. */
export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "just now", "3 min ago", then the clock time; the full date and time is the tooltip. */
export function Ago({ at }: { at: number | null }) {
  const now = useContext(NowContext);
  const locale = usePreferences((s) => s.locale);
  if (!at) return null;
  return (
    <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>
      {relativeAgo(at, now, locale) ?? clock(at)}
    </time>
  );
}

/** The line between one day's messages and the next. */
export function DaySeparator({ at }: { at: number }) {
  const now = useContext(NowContext);
  const locale = usePreferences((s) => s.locale);
  return (
    <div className="day-separator" role="separator">
      <span>{dayLabel(at, now, locale)}</span>
    </div>
  );
}

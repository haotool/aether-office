import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dayLabel, relativeAgo } from './conv-time.js';
import { useLocale } from '../../ui/useT.js';

const TICK_MS = 30_000;
const NowContext = createContext(Date.now());

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

export function Ago({ at }: { at: number | null }) {
  const now = useContext(NowContext);
  const locale = useLocale();
  if (!at) return null;
  return (
    <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>
      {relativeAgo(at, now, locale) ?? clock(at)}
    </time>
  );
}

export function DaySeparator({ at }: { at: number }) {
  const now = useContext(NowContext);
  const locale = useLocale();
  return (
    <div className="day-separator" role="separator">
      <span>{dayLabel(at, now, locale)}</span>
    </div>
  );
}

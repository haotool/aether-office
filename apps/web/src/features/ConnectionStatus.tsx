import { useEffect, useState } from 'react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import type { Key } from '../i18n.js';
import { ageText, type LinkStatus } from './live-link.js';
import { useLink } from './use-session-stream.js';

const LABEL: Record<LinkStatus, Key> = {
  connecting: 'linkConnecting',
  live: 'linkLive',
  reconnecting: 'linkReconnecting',
  offline: 'linkOffline',
};
const DOT: Record<LinkStatus, string> = {
  connecting: 'gold',
  live: 'mint',
  reconnecting: 'gold',
  offline: 'red',
};
const TICK_MS = 5000;

/** A dot and a word for the link to the control plane, with how long ago anything last arrived. */
export function ConnectionStatus({ updatedAt, offline }: { updatedAt: number; offline: boolean }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const link = useLink();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const status: LinkStatus = offline ? 'offline' : link.status;
  const last = Math.max(link.lastAt ?? 0, updatedAt);
  const age = last ? ageText(now - last, locale) : null;
  return (
    <span className="link-status" role="status" title={age ? `${t('linkLastUpdate')} ${age}` : ''}>
      <i className={`dot ${DOT[status]}`} />
      <span className="link-text">{t(LABEL[status])}</span>
      {age && <small>{age}</small>}
    </span>
  );
}

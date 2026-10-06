import { useEffect, useMemo, useRef } from 'react';
import { useT } from '../ui.js';
import { isUnconfirmed, seenIn, type Pending } from './composer-model.js';
import { useOutbox, usePending } from './outbox.js';

const LABEL = {
  queued: 'pendingQueued',
  sending: 'pendingSending',
  sent: 'pendingSent',
  failed: 'pendingFailed',
} as const;

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * What was typed in the composer and the transcript has not shown yet, as the person's own bubbles at the end of the
 * conversation. Each gives way to the real prompt when the transcript has it (matched by text, see `seenIn`), so a
 * message is never shown twice.
 */
export function PendingBubbles({
  sessionKey,
  prompts,
}: {
  sessionKey: string;
  prompts: readonly { text: string; at: number | null }[];
}) {
  const t = useT();
  const items = usePending(sessionKey);
  const update = useOutbox((s) => s.update);
  const seen = useMemo(() => seenIn(items, prompts), [items, prompts]);
  const end = useRef<HTMLDivElement>(null);
  const shown = items.filter((p) => !seen.has(p.localId));
  useEffect(() => {
    if (seen.size) update(sessionKey, (list) => list.filter((p) => !seen.has(p.localId)));
  }, [seen, sessionKey, update]);
  // A message you just wrote is where you look next.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [shown.length]);
  const set = (localId: string, change: Partial<Pending> | null) =>
    update(sessionKey, (list) =>
      change
        ? list.map((p) => (p.localId === localId ? { ...p, ...change } : p))
        : list.filter((p) => p.localId !== localId),
    );
  if (!shown.length) return null;
  return (
    <div className="pending-list" ref={end}>
      {shown.map((p) => (
        <div key={p.localId} className={`msg user pending ${p.state}`} data-local-id={p.localId}>
          <span className="msg-who">
            {t('role_user')} <time>{clock(p.at)}</time>
          </span>
          <p>{p.text}</p>
          <small role="status">
            {isUnconfirmed(p, Date.now()) ? t('pendingUnconfirmed') : t(LABEL[p.state])}
            {p.state === 'failed' && p.error ? ` · ${p.error}` : ''}
          </small>
          {(p.state === 'failed' || isUnconfirmed(p, Date.now())) && (
            <span className="pending-actions">
              {p.state === 'failed' && (
                <button className="secondary" onClick={() => set(p.localId, { state: 'queued' })}>
                  {t('pendingRetry')}
                </button>
              )}
              <button className="secondary" onClick={() => set(p.localId, null)}>
                {t('pendingDismiss')}
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

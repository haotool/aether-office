import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import type { Locale } from '../i18n.js';
import { attentionReason, needsAttention, rowLabelOf } from '../localSessions.js';
import { sessionsWaiting } from './needs-you.js';
import { usePreferences } from '../state.js';
import { Sheet, useT } from '../ui.js';
import { reapZombies } from './reap.js';
import { SessionDialogs } from './SessionDialogs.js';
import { idleSessions } from './clock-out.js';

/** Reaps the zombie processes under a session and says what is left, per session. */
function useReap() {
  const t = useT();
  const client = useQueryClient();
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const reap = async (s: AttributedSession) => {
    setBusy(s.key);
    try {
      const r = await reapZombies(s);
      setResult((all) => ({
        ...all,
        [s.key]: r.after === 0 ? t('reapCleared') : `${t('reapRemaining')} (${r.after})`,
      }));
      await client.invalidateQueries({ queryKey: ['local-sessions'] });
    } catch (e) {
      setResult((all) => ({ ...all, [s.key]: e instanceof Error ? e.message : 'REQUEST_FAILED' }));
    } finally {
      setBusy('');
    }
  };
  return { result, busy, reap };
}

type RowProps = {
  s: AttributedSession;
  waiting: boolean;
  owner: boolean;
  locale: Locale;
  note: string | undefined;
  reaping: boolean;
  onFocus: () => void;
  onReap: () => void;
  onStop: () => void;
};

function AttentionRow({ s, waiting, owner, locale, note, reaping, ...on }: RowProps) {
  const t = useT();
  const running = owner && s.process === 'running';
  return (
    <li className="attention-row">
      <span className="sheet-main">
        <strong title={s.title ?? s.repo}>{rowLabelOf(s)}</strong>
        <small>
          {[waiting ? t('waitingForYou') : null, attentionReason(s, locale)]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {note && <small role="status">{note}</small>}
      </span>
      <span className="attention-actions">
        <button className="secondary" onClick={on.onFocus}>
          {t('focus')}
        </button>
        {running && s.liveness.zombies.length > 0 && (
          <button className="secondary" disabled={reaping} onClick={on.onReap}>
            {t('reapZombies')}
          </button>
        )}
        {running && ['dormant', 'orphaned'].includes(s.liveness.state) && (
          <button className="secondary danger-soft" onClick={on.onStop}>
            {t('stopAction')}
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * The sessions that want a person for how they are alive (forgotten for hours, left without an owner, zombies under
 * them): a chip with the count and a sheet with the reason and what can be done, one tap each. Shown only when there is
 * something to do.
 */
export function AttentionSessions({
  sessions,
  owner,
  onOpen,
}: {
  sessions: readonly AttributedSession[];
  /** Stopping and reaping are an owner's: anyone else sees the list and can look. */
  owner: boolean;
  onOpen: (session: AttributedSession) => void;
}) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<AttributedSession | null>(null);
  const [clockingOut, setClockingOut] = useState(false);
  const { result, busy, reap } = useReap();
  // First what only a person can move on (an approval, a question), then what is merely forgotten or ownerless.
  const waiting = sessionsWaiting(sessions, Date.now());
  const list = [...waiting, ...sessions.filter((s) => needsAttention(s) && !waiting.includes(s))];
  const idle = idleSessions(sessions, 1);
  if (!list.length && !open && !clockingOut) return null;
  return (
    <>
      <button
        className="chip-attention"
        aria-expanded={open}
        aria-label={`${t('needsAttention')}: ${list.length}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">!</span>
        <span className="chip-label">{t('chipNeedsYou')}</span>
        {list.length}
      </button>
      {open && (
        <Sheet title={t('needsAttention')} count={list.length} onClose={() => setOpen(false)}>
          {owner && idle.length > 0 && (
            <li className="attention-row clock-out-offer">
              <button
                className="primary clock-out-go"
                onClick={() => {
                  setOpen(false);
                  setClockingOut(true);
                }}
              >
                <DoorOpen size={18} aria-hidden="true" />
                {t('clockOut')} ({idle.length})
              </button>
            </li>
          )}
          {list.map((s) => (
            <AttentionRow
              key={s.key}
              {...{ s, owner, locale }}
              waiting={waiting.includes(s)}
              note={result[s.key]}
              reaping={busy === s.key}
              onFocus={() => {
                setOpen(false);
                onOpen(s);
              }}
              onReap={() => void reap(s)}
              onStop={() => setStopping(s)}
            />
          ))}
          {!list.length && <li className="sheet-empty">{t('nothingNeedsAttention')}</li>}
        </Sheet>
      )}
      <SessionDialogs
        {...{ sessions, locale, stopping, clockingOut }}
        onStopClose={() => setStopping(null)}
        onClockOutClose={() => setClockingOut(false)}
      />
    </>
  );
}

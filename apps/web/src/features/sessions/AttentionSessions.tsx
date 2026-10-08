import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import type { Locale } from '../../lib/i18n/i18n.js';
import { attentionReason, needsAttention } from '../../lib/sessions/session-attention.js';
import { rowLabelOf } from '../../lib/sessions/session-names.js';
import { sessionsWaiting } from './needs-you.js';
import { Sheet } from '../../ui/Modal.js';
import { useT, useLocale, useWhy } from '../../ui/useT.js';
import { reapZombies } from '../operations/reap.js';
import { SessionDialogs } from './SessionDialogs.js';
import { idleSessions } from '../operations/clock-out.js';

type AttentionSessionsProps = {
  sessions: readonly AttributedSession[];
  /** Stopping and reaping are an owner's: anyone else sees the list and can look. */
  owner: boolean;
  onOpen: (session: AttributedSession) => void;
};

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
  const whyNot = useWhy();
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
          <button
            className="secondary"
            disabled={reaping}
            {...whyNot([!reaping, 'whyBusy'])}
            onClick={on.onReap}
          >
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

/** First what only a person can move on (an approval, a question), then what is merely forgotten or ownerless. */
function attentionList(sessions: readonly AttributedSession[]) {
  const waiting = sessionsWaiting(sessions, Date.now());
  const list = [...waiting, ...sessions.filter((s) => needsAttention(s) && !waiting.includes(s))];
  return { waiting, list };
}

function ClockOutOffer({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useT();
  return (
    <li className="attention-row clock-out-offer">
      <button className="primary clock-out-go" onClick={onClick}>
        <DoorOpen size={18} aria-hidden="true" />
        {t('clockOut')} ({count})
      </button>
    </li>
  );
}

function AttentionChip({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      className="chip-attention"
      aria-expanded={open}
      aria-label={`${t('needsAttention')}: ${count}`}
      onClick={onClick}
    >
      <span aria-hidden="true">!</span>
      <span className="chip-label">{t('chipNeedsYou')}</span>
      {count}
    </button>
  );
}

/**
 * The sessions that want a person for how they are alive (forgotten for hours, left without an owner, zombies under
 * them): a chip with the count and a sheet with the reason and what can be done, one tap each. Shown only when there is
 * something to do.
 */
export function AttentionSessions({ sessions, owner, onOpen }: AttentionSessionsProps) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<AttributedSession | null>(null);
  const [clockingOut, setClockingOut] = useState(false);
  const { result, busy, reap } = useReap();
  const { waiting, list } = attentionList(sessions);
  const idle = idleSessions(sessions, 1);
  if (!list.length && !open && !clockingOut) return null;
  return (
    <>
      <AttentionChip count={list.length} open={open} onClick={() => setOpen(true)} />
      {open && (
        <Sheet title={t('needsAttention')} count={list.length} onClose={() => setOpen(false)}>
          {owner && idle.length > 0 && (
            <ClockOutOffer
              count={idle.length}
              onClick={() => {
                setOpen(false);
                setClockingOut(true);
              }}
            />
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

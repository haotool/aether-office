import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { attentionReason, needsAttention } from '../localSessions.js';
import { usePreferences } from '../state.js';
import { Sheet, useT } from '../ui.js';
import { reapZombies } from './reap.js';
import { StopSession } from './StopSession.js';

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
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<AttributedSession | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const list = sessions.filter(needsAttention);
  if (!list.length && !open) return null;
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
  return (
    <>
      <button
        className="chip-attention"
        aria-expanded={open}
        aria-label={`${t('needsAttention')} ${list.length}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">!</span>
        {list.length}
      </button>
      {open && (
        <Sheet title={t('needsAttention')} count={list.length} onClose={() => setOpen(false)}>
          {list.map((s) => (
            <li key={s.key} className="attention-row">
              <span className="sheet-main">
                <strong>{s.title ?? s.repo}</strong>
                <small>{attentionReason(s, locale)}</small>
                {result[s.key] && <small role="status">{result[s.key]}</small>}
              </span>
              <span className="attention-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setOpen(false);
                    onOpen(s);
                  }}
                >
                  {t('focus')}
                </button>
                {owner && s.liveness.zombies.length > 0 && s.process === 'running' && (
                  <button
                    className="secondary"
                    disabled={busy === s.key}
                    onClick={() => void reap(s)}
                  >
                    {t('reapZombies')}
                  </button>
                )}
                {owner &&
                  s.process === 'running' &&
                  ['dormant', 'orphaned'].includes(s.liveness.state) && (
                    <button className="secondary danger-soft" onClick={() => setStopping(s)}>
                      {t('stopAction')}
                    </button>
                  )}
              </span>
            </li>
          ))}
          {!list.length && <li className="sheet-empty">{t('nothingNeedsAttention')}</li>}
        </Sheet>
      )}
      {stopping && (
        <StopSession session={stopping} locale={locale} onClose={() => setStopping(null)} />
      )}
    </>
  );
}

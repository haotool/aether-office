import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LocalSession } from '@aether/contracts';
import { api } from '../api.js';
import { formatSpan } from '../localSessions.js';
import { Modal, useT } from '../ui.js';

const OUTCOME = {
  stopped: 'stopDone',
  still_running: 'stopStill',
  changed: 'stopChanged',
  zombie: 'stopZombie',
} as const;

/** Confirms, then asks the server to end the process behind a dormant or orphaned session (see stop-session.ts). */
export function StopSession({
  session,
  locale,
  onClose,
}: {
  session: LocalSession;
  locale: 'zh-TW' | 'en';
  onClose: () => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<keyof typeof OUTCOME | null>(null);
  const [error, setError] = useState('');
  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ outcome: keyof typeof OUTCOME }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/stop`,
        { method: 'POST', body: JSON.stringify({ startedAt: session.liveness.startedAt }) },
      );
      setOutcome(result.outcome);
      await client.invalidateQueries({ queryKey: ['local-sessions'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('stopProcess')} onClose={onClose}>
      <p>
        <b>{session.title ?? session.repo}</b>
        <br />
        <small>
          {t(session.liveness.state === 'orphaned' ? 'livenessOrphaned' : 'livenessDormant')}
          {session.liveness.quietMs !== null &&
            ` · ${t('quietFor')} ${formatSpan(session.liveness.quietMs, locale)}`}
        </small>
      </p>
      {outcome ? (
        <p role="status">{t(OUTCOME[outcome])}</p>
      ) : (
        <>
          <p>{t('stopExplain')}</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={() => void stop()}>
              {busy ? t('loading') : t('stopConfirm')}
            </button>
            <button className="secondary" disabled={busy} onClick={onClose}>
              {t('cancel')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

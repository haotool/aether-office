import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OfficeEvent } from '@aether/contracts';
import { api } from '../api.js';
import { Badge, PageHeading, Empty, useT } from '../ui.js';
export function History({ projectId }: { projectId: string }) {
  const t = useT();
  const [replayTo, setReplayTo] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['events', projectId],
    queryFn: () => api<{ events: OfficeEvent[] }>(`/api/projects/${projectId}/events?after=0`),
    refetchInterval: 5000,
  });
  return (
    <>
      <PageHeading title={t('history')} subtitle={t('historyHint')} />
      {replayTo === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const seq = String(new FormData(e.currentTarget).get('seq') ?? '').trim();
            if (/^\d{1,19}$/.test(seq)) setReplayTo(seq);
          }}
        >
          <label>
            {t('replayTo')} <input name="seq" inputMode="numeric" pattern="[0-9]{1,19}" required />
          </label>
          <button type="submit">{t('replayStart')}</button>
        </form>
      ) : (
        <div role="status" className="replay-banner">
          <strong>REPLAY</strong> · {t('replayReadOnly')} · seq ≤ {replayTo}
          <button type="button" onClick={() => setReplayTo(null)}>
            {t('replayExit')}
          </button>
        </div>
      )}
      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.error ? (
        <p role="alert" className="error-text">
          {query.error.message}
        </p>
      ) : query.data?.events.length ? (
        <div className="history-table" tabIndex={0} role="region" aria-label={t('history')}>
          <table>
            <thead>
              <tr>
                <th>SEQ</th>
                <th>{t('time')}</th>
                <th>{t('event')}</th>
                <th>{t('source')}</th>
              </tr>
            </thead>
            <tbody>
              {[...query.data.events]
                .filter((event) => replayTo === null || BigInt(event.seq) <= BigInt(replayTo))
                .reverse()
                .map((event) => (
                  <tr key={event.eventId}>
                    <td>
                      <code>{event.seq}</code>
                    </td>
                    <td>{new Date(event.occurredAt).toLocaleString()}</td>
                    <td>{event.type}</td>
                    <td>
                      <Badge state={event.source === 'simulated' ? 'demo' : 'live'} />{' '}
                      {event.source}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={t('noActivity')} />
      )}
    </>
  );
}

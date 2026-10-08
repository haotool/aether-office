import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OfficeEvent } from '@aether/contracts';
import { api } from '../api.js';
import { Badge } from '../ui/Badge.js';
import { PageHeading } from '../ui/PageHeading.js';
import { Empty } from '../ui/Empty.js';
import { useT } from '../ui/useT.js';
import { QueryStatus } from './QueryStatus.js';
/** Asks for a sequence number to replay up to, or shows the banner that says the history is read-only up to it. */
function ReplayControl({
  replayTo,
  onChange,
}: {
  replayTo: string | null;
  onChange: (seq: string | null) => void;
}) {
  const t = useT();
  if (replayTo !== null)
    return (
      <div role="status" className="replay-banner">
        <strong>REPLAY</strong> · {t('replayReadOnly')} · seq ≤ {replayTo}
        <button type="button" onClick={() => onChange(null)}>
          {t('replayExit')}
        </button>
      </div>
    );
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const seq = String(new FormData(e.currentTarget).get('seq') ?? '').trim();
        if (/^\d{1,19}$/.test(seq)) onChange(seq);
      }}
    >
      <label>
        {t('replayTo')} <input name="seq" inputMode="numeric" pattern="[0-9]{1,19}" required />
      </label>
      <button type="submit">{t('replayStart')}</button>
    </form>
  );
}

/** The events, newest first; with a replay point, only those up to it. */
function EventsTable({ events, replayTo }: { events: OfficeEvent[]; replayTo: string | null }) {
  const t = useT();
  return (
    <div className="history-table" tabIndex={0} role="region" aria-label={t('history')}>
      <table className="stack">
        <thead>
          <tr>
            <th>SEQ</th>
            <th>{t('time')}</th>
            <th>{t('event')}</th>
            <th>{t('source')}</th>
          </tr>
        </thead>
        <tbody>
          {[...events]
            .filter((event) => replayTo === null || BigInt(event.seq) <= BigInt(replayTo))
            .reverse()
            .map((event) => (
              <tr key={event.eventId}>
                <td data-label="SEQ">
                  <code>{event.seq}</code>
                </td>
                <td data-label={t('time')}>{new Date(event.occurredAt).toLocaleString()}</td>
                <td data-label={t('event')}>{event.type}</td>
                <td data-label={t('source')}>
                  <Badge state={event.source === 'simulated' ? 'demo' : 'live'} /> {event.source}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

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
      <ReplayControl replayTo={replayTo} onChange={setReplayTo} />
      <QueryStatus query={query} />
      {query.isPending || query.error ? null : query.data?.events.length ? (
        <EventsTable events={query.data.events} replayTo={replayTo} />
      ) : (
        <Empty title={t('noActivity')} />
      )}
    </>
  );
}

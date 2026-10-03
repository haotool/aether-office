import { useQuery } from '@tanstack/react-query';
import type { OfficeEvent } from '@aether/contracts';
import { api } from '../api.js';
import { Badge, PageHeading, Empty, useT } from '../ui.js';
export function History({ projectId }: { projectId: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ['events', projectId],
    queryFn: () => api<{ events: OfficeEvent[] }>(`/api/projects/${projectId}/events?after=0`),
    refetchInterval: 5000,
  });
  return (
    <>
      <PageHeading title={t('history')} subtitle={t('historyHint')} />
      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.error ? (
        <p role="alert" className="error-text">
          {query.error.message}
        </p>
      ) : query.data?.events.length ? (
        <div className="history-table">
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
              {[...query.data.events].reverse().map((event) => (
                <tr key={event.eventId}>
                  <td>
                    <code>{event.seq}</code>
                  </td>
                  <td>{new Date(event.occurredAt).toLocaleString()}</td>
                  <td>{event.type}</td>
                  <td>
                    <Badge state={event.source === 'simulated' ? 'demo' : 'live'} />
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

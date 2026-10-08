import { useQuery } from '@tanstack/react-query';
import type { FileReservation } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { useT } from '../../ui/useT.js';

export function Reservations({ projectId }: { projectId: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ['reservations', projectId],
    queryFn: () =>
      api<{ reservations: FileReservation[] }>(`/api/projects/${projectId}/reservations`),
    refetchInterval: 5000,
  });
  const rows = query.data?.reservations ?? [];
  return (
    <section aria-labelledby="reservations-title">
      <h2 id="reservations-title">{t('reservations')}</h2>
      <p className="muted">{t('reservationsNote')}</p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {rows.length === 0 ? (
        <p>{t('reservationsEmpty')}</p>
      ) : (
        <ul className="plain-list">
          {rows.map((r) => (
            <li key={r.id} className="panel">
              <code>{r.patterns.join(', ')}</code>
              <small>
                {' '}
                #{r.fence} · {t('reservationExpires')} {new Date(r.expiresAt).toLocaleTimeString()}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

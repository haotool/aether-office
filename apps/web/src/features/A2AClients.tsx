import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, execute } from '../api.js';
import { Field, useT, whyNot } from '../ui.js';

type Status = {
  enabled: boolean;
  cardUrl: string | null;
  clients: { id: string; name: string; maxOpen: number; revokedAt: number | null; open: number }[];
};

export function A2AClients({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null);
  const key = ['a2a', projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<Status>(`/api/projects/${projectId}/a2a`),
    refetchInterval: 5000,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      await client.invalidateQueries({ queryKey: key });
    }
  };
  if (!query.data) return null;
  return (
    <section aria-labelledby="a2a-title">
      <h3 id="a2a-title">A2A</h3>
      {!query.data.enabled ? (
        <p role="status">{t('a2aDisabled')}</p>
      ) : (
        <>
          <p className="muted">{t('a2aNote')}</p>
          <p>
            <code>{query.data.cardUrl}</code>
          </p>
          <ul className="plain-list">
            {query.data.clients.map((c) => (
              <li key={c.id} className="panel">
                <strong>{c.name}</strong> · {t('a2aOpen')}: {c.open}/{c.maxOpen}
                {c.revokedAt ? (
                  <> · {t('a2aRevoked')}</>
                ) : (
                  <>
                    {' '}
                    <button
                      disabled={!canManage}
                      {...whyNot(canManage, t('needOwner'))}
                      onClick={() =>
                        run(() => execute('a2a.client.revoke', { clientId: c.id }, projectId))
                      }
                    >
                      {t('a2aRevoke')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void run(async () => {
                  const receipt = await execute(
                    'a2a.client.create',
                    { name: form.get('name'), maxOpen: Number(form.get('maxOpen')) },
                    projectId,
                  );
                  setIssued(receipt.result as unknown as { id: string; token: string });
                });
              }}
            >
              <Field label={t('a2aClientName')}>
                <input name="name" required maxLength={160} />
              </Field>
              <Field label={t('a2aMaxOpen')}>
                <input name="maxOpen" type="number" min={1} max={100} defaultValue={10} />
              </Field>
              {error && <p role="alert">{error}</p>}
              <button type="submit">{t('a2aCreate')}</button>
            </form>
          )}
          {issued && (
            <div role="status" className="panel">
              <p>{t('a2aShownOnce')}</p>
              <code>{issued.token}</code>
            </div>
          )}
        </>
      )}
    </section>
  );
}

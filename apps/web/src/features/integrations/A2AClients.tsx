import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Field } from '../../ui/Field.js';
import { useT, useWhy } from '../../ui/useT.js';
import { useCommandRunner } from '../shell-chrome/panel-kit.js';

type Client = { id: string; name: string; maxOpen: number; revokedAt: number | null; open: number };
type Status = { enabled: boolean; cardUrl: string | null; clients: Client[] };
type Run = (fn: () => Promise<unknown>) => Promise<void>;

function ClientRow({
  client: c,
  canManage,
  onRevoke,
}: {
  client: Client;
  canManage: boolean;
  onRevoke: () => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <li className="panel">
      <strong>{c.name}</strong> · {t('a2aOpen')}: {c.open}/{c.maxOpen}
      {c.revokedAt ? (
        <> · {t('a2aRevoked')}</>
      ) : (
        <>
          {' '}
          <button disabled={!canManage} {...whyNot([canManage, 'needOwner'])} onClick={onRevoke}>
            {t('a2aRevoke')}
          </button>
        </>
      )}
    </li>
  );
}

function CreateClientForm({
  projectId,
  error,
  run,
  onIssued,
}: {
  projectId: string;
  error: string;
  run: Run;
  onIssued: (issued: { id: string; token: string }) => void;
}) {
  const t = useT();
  return (
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
          onIssued(receipt.result as { id: string; token: string });
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
  );
}

export function A2AClients({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null);
  const key = ['a2a', projectId];
  const { error, run } = useCommandRunner([key], true);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<Status>(`/api/projects/${projectId}/a2a`),
    refetchInterval: 5000,
  });
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
              <ClientRow
                key={c.id}
                client={c}
                canManage={canManage}
                onRevoke={() =>
                  void run(() => execute('a2a.client.revoke', { clientId: c.id }, projectId))
                }
              />
            ))}
          </ul>
          {canManage && (
            <CreateClientForm projectId={projectId} error={error} run={run} onIssued={setIssued} />
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

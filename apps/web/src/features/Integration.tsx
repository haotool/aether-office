import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IntegrationResult, Work } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';
import type { Key } from '../i18n.js';

type Row = {
  jobId: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'indeterminate';
  status: IntegrationResult['status'] | null;
  candidate: string | null;
  error: string | null;
  detail: IntegrationResult | null;
};

function label(r: Row): Key {
  if (r.status === 'merged') return 'integrationMerged';
  if (r.status === 'up_to_date') return 'integrationUpToDate';
  if (r.status === 'conflict') return 'integrationConflict';
  if (r.status === 'base_moved') return 'integrationBaseMoved';
  if (r.state === 'queued' || r.state === 'running') return 'integrationRunning';
  return 'integrationFailed';
}

export function Integration({
  projectId,
  work,
  canIntegrate,
  onSaved,
}: {
  projectId: string;
  work: Work;
  canIntegrate: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const key = ['integrations', projectId, work.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ integrations: Row[] }>(`/api/projects/${projectId}/work/${work.id}/integrations`),
    refetchInterval: 3000,
  });
  const rows = query.data?.integrations ?? [];
  return (
    <section aria-label={t('integration')}>
      <h4>{t('integration')}</h4>
      <p className="muted">{t('integrationNote')}</p>
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={r.jobId}>
            <strong>{t(label(r))}</strong> {r.candidate && <code>{r.candidate}</code>}
            {r.error && <code> {r.error}</code>}
            {r.detail?.status === 'conflict' && <code> {r.detail.files.join(', ')}</code>}
            {r.detail?.status === 'base_moved' && <code> {r.detail.actual.slice(0, 12)}</code>}
          </li>
        ))}
      </ul>
      {canIntegrate && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setError('');
            try {
              await execute(
                'work.integrate',
                {
                  workId: work.id,
                  baseBranch: form.get('baseBranch'),
                  expectedBase: form.get('expectedBase'),
                },
                projectId,
                work.version,
              );
              await client.invalidateQueries({ queryKey: key });
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'REQUEST_FAILED');
            }
          }}
        >
          <Field label={t('integrationBranch')}>
            <input name="baseBranch" required defaultValue="main" pattern="[\w.\/\-]{1,100}" />
          </Field>
          <Field label={t('integrationBase')}>
            <input
              name="expectedBase"
              required
              pattern="[0-9a-f]{40}"
              placeholder="git rev-parse <branch>"
            />
          </Field>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('integrationStart')}</button>
        </form>
      )}
    </section>
  );
}

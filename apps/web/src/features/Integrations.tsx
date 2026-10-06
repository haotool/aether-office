import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IntegrationConnection } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';

export function Integrations({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<'github' | 'linear'>('github');
  const key = ['integrations', projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ integrations: IntegrationConnection[] }>(`/api/projects/${projectId}/integrations`),
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
      await client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    }
  };
  return (
    <section aria-labelledby="integrations-title">
      <h3 id="integrations-title">{t('integrations')}</h3>
      <p className="muted">{t('integrationsNote')}</p>
      {query.data?.integrations.length === 0 && <p>{t('integrationsEmpty')}</p>}
      <ul className="plain-list">
        {query.data?.integrations.map((c) => (
          <li key={c.id} className="panel">
            <strong>{c.provider}</strong> · {c.target} · <code>{c.tokenEnv}</code>
            <br />
            <small>
              {t('integrationLinked')}: {c.linked} · {t('integrationConflicts')}: {c.conflicts} ·{' '}
              {t('integrationLastSync')}:{' '}
              {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : t('unavailable')}
            </small>
            {c.lastError && (
              <p role="alert" className="error-text">
                {c.lastError}
              </p>
            )}
            <button
              disabled={!canManage || !c.enabled}
              onClick={() =>
                run(() =>
                  api(`/api/projects/${projectId}/integrations/${c.id}/sync`, {
                    method: 'POST',
                    body: '{}',
                  }),
                )
              }
            >
              {t('integrationSync')}
            </button>{' '}
            <button
              disabled={!canManage}
              onClick={() =>
                run(() =>
                  execute(
                    'integration.toggle',
                    { integrationId: c.id, enabled: !c.enabled },
                    projectId,
                    c.version,
                  ),
                )
              }
            >
              {c.enabled ? t('scheduleDisable') : t('scheduleEnable')}
            </button>
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const common = { provider, tokenEnv: form.get('tokenEnv') };
            const data =
              provider === 'github'
                ? { ...common, owner: form.get('owner'), repo: form.get('repo') }
                : { ...common, teamKey: form.get('teamKey') };
            void run(() => execute('integration.connect', data, projectId));
          }}
        >
          <Field label={t('integrationProvider')}>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'github' | 'linear')}
            >
              <option value="github">GitHub</option>
              <option value="linear">Linear</option>
            </select>
          </Field>
          {provider === 'github' ? (
            <>
              <Field label={t('integrationOwner')}>
                <input name="owner" required />
              </Field>
              <Field label={t('integrationRepo')}>
                <input name="repo" required />
              </Field>
            </>
          ) : (
            <Field label={t('integrationTeam')}>
              <input name="teamKey" required />
            </Field>
          )}
          <Field label={t('integrationTokenEnv')}>
            <input
              name="tokenEnv"
              required
              pattern="[A-Z][A-Z0-9_]{1,63}"
              placeholder="GITHUB_TOKEN"
            />
          </Field>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('integrationConnect')}</button>
        </form>
      )}
    </section>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';
type Policy = { liveEnabled: boolean; maxTurns: number; timeoutMs: number; version: number };
export function ExecutionSettings({
  projectId,
  canConfigure,
}: {
  projectId: string;
  canConfigure: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['execution', projectId],
    queryFn: () => api<Policy>(`/api/projects/${projectId}/execution`),
  });
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p>{t('loading')}</p>;
  const policy = query.data;
  return (
    <form
      className="settings-panel panel"
      key={`${projectId}:${policy.version}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
          await execute(
            'project.execution.configure',
            {
              liveEnabled: data.get('enabled') === 'on',
              maxTurns: Number(data.get('turns')),
              timeoutMs: Number(data.get('seconds')) * 1000,
            },
            projectId,
            policy.version,
          );
          await query.refetch();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{t('executionPolicy')}</h2>
      <p>{t('executionConsent')}</p>
      <label className="toggle-label">
        <span>{t('enableLive')}</span>
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={policy.liveEnabled}
          disabled={!canConfigure || busy}
        />
      </label>
      <Field label={t('maxTurns')}>
        <input
          name="turns"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={policy.maxTurns}
          disabled={!canConfigure || busy}
        />
      </Field>
      <Field label={t('timeoutSeconds')}>
        <input
          name="seconds"
          type="number"
          min={1}
          max={600}
          required
          defaultValue={policy.timeoutMs / 1000}
          disabled={!canConfigure || busy}
        />
      </Field>
      <p className="muted">{t('runnerGrantRequired')}</p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={!canConfigure || busy}>
        {t('save')}
      </button>
    </form>
  );
}

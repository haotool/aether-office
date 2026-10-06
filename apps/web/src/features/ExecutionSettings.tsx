import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';

import { ErrorLine, Skeleton, StatusChip, Switch } from './settings/kit.js';

type Policy = { liveEnabled: boolean; maxTurns: number; timeoutMs: number; version: number };

/** The project's live-execution policy: whether live agents may run, and how long and how many turns they get. */
export function ExecutionSettings({
  projectId,
  canConfigure,
}: {
  projectId: string;
  canConfigure: boolean;
}) {
  const query = useQuery({
    queryKey: ['execution', projectId],
    queryFn: () => api<Policy>(`/api/projects/${projectId}/execution`),
  });
  if (query.error)
    return <ErrorLine message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton />;
  return (
    <PolicyForm
      key={`${projectId}:${query.data.version}`}
      policy={query.data}
      projectId={projectId}
      canConfigure={canConfigure}
      onSaved={() => query.refetch()}
    />
  );
}

function PolicyForm({
  policy,
  projectId,
  canConfigure,
  onSaved,
}: {
  policy: Policy;
  projectId: string;
  canConfigure: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const t = useT();
  const [live, setLive] = useState(policy.liveEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="sform"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
          await execute(
            'project.execution.configure',
            {
              liveEnabled: live,
              maxTurns: Number(data.get('turns')),
              timeoutMs: Number(data.get('seconds')) * 1000,
            },
            projectId,
            policy.version,
          );
          await onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{t('executionPolicy')}</h3>
      <p>{t('executionConsent')}</p>
      <div className="sform-switch">
        <span>{t('enableLive')}</span>
        <Switch
          name={t('enableLive')}
          checked={live}
          onChange={setLive}
          disabled={!canConfigure || busy}
        />
        <StatusChip tone={live ? 'ok' : 'off'}>{t(live ? 'stOn' : 'stOff')}</StatusChip>
      </div>
      <div className="sform-fields">
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
      </div>
      <p className="muted">{t('runnerGrantRequired')}</p>
      {!canConfigure && <StatusChip tone="lock">{t('stOwnerOnly')}</StatusChip>}
      {error && <ErrorLine message={error} />}
      <button className="primary" disabled={!canConfigure || busy}>
        {t('save')}
      </button>
    </form>
  );
}

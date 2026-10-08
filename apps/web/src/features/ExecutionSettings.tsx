import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { execute } from '../api-commands.js';
import { Field } from '../ui/Field.js';
import { useT, useWhy } from '../ui/useT.js';
import type { Why } from '../ui/whyNot.js';

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

/** Saves the policy form: the busy flag, the error to show, and the submit handler. */
function useSavePolicy(
  projectId: string,
  policy: Policy,
  live: boolean,
  onSaved: () => Promise<unknown>,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (form: HTMLFormElement) => {
    const data = new FormData(form);
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
  };
  return { busy, error, save };
}

function PolicyLimits({ policy, why, off }: { policy: Policy; why: Why; off: boolean }) {
  const t = useT();
  return (
    <div className="sform-fields">
      <Field label={t('maxTurns')}>
        <input
          name="turns"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={policy.maxTurns}
          disabled={off}
          {...why}
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
          disabled={off}
          {...why}
        />
      </Field>
    </div>
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
  const whyNot = useWhy();
  const [live, setLive] = useState(policy.liveEnabled);
  const { busy, error, save } = useSavePolicy(projectId, policy, live, onSaved);
  const off = !canConfigure || busy;
  const why = whyNot([canConfigure, 'needOwner'], [!busy, 'whyBusy']);
  return (
    <form
      className="sform"
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
    >
      <h3>{t('executionPolicy')}</h3>
      <p>{t('executionConsent')}</p>
      <div className="sform-switch">
        <span>{t('enableLive')}</span>
        <Switch name={t('enableLive')} checked={live} onChange={setLive} disabled={off} />
        <StatusChip tone={live ? 'ok' : 'off'}>{t(live ? 'stOn' : 'stOff')}</StatusChip>
      </div>
      <PolicyLimits policy={policy} why={why} off={off} />
      <p className="muted">{t('runnerGrantRequired')}</p>
      {!canConfigure && <StatusChip tone="lock">{t('stOwnerOnly')}</StatusChip>}
      {error && <ErrorLine message={error} />}
      <button className="primary" disabled={off} {...why}>
        {t('save')}
      </button>
    </form>
  );
}

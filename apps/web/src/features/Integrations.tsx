import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IntegrationConnection } from '@aether/contracts';
import { api } from '../api.js';
import { execute } from '../api-commands.js';
import { Field } from '../ui/Field.js';
import { useT, useWhy } from '../ui/useT.js';
import { useCommandRunner } from './panel-kit.js';

type Provider = 'github' | 'linear';
type Run = (fn: () => Promise<unknown>) => Promise<void>;

type ConnectionRowProps = {
  connection: IntegrationConnection;
  projectId: string;
  canManage: boolean;
  run: Run;
};

function ConnectionRow({ connection: c, projectId, canManage, run }: ConnectionRowProps) {
  const t = useT();
  const whyNot = useWhy();
  const sync = () =>
    run(() =>
      api(`/api/projects/${projectId}/integrations/${c.id}/sync`, { method: 'POST', body: '{}' }),
    );
  const toggle = () =>
    run(() =>
      execute(
        'integration.toggle',
        { integrationId: c.id, enabled: !c.enabled },
        projectId,
        c.version,
      ),
    );
  return (
    <li className="panel">
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
        {...whyNot([canManage, 'needOwner'], [c.enabled, 'whyIntegrationOff'])}
        onClick={sync}
      >
        {t('integrationSync')}
      </button>{' '}
      <button disabled={!canManage} {...whyNot([canManage, 'needOwner'])} onClick={toggle}>
        {c.enabled ? t('scheduleDisable') : t('scheduleEnable')}
      </button>
    </li>
  );
}

function ConnectForm({ projectId, error, run }: { projectId: string; error: string; run: Run }) {
  const t = useT();
  const [provider, setProvider] = useState<Provider>('github');
  return (
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
        <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
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
        <input name="tokenEnv" required pattern="[A-Z][A-Z0-9_]{1,63}" placeholder="GITHUB_TOKEN" />
      </Field>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('integrationConnect')}</button>
    </form>
  );
}

export function Integrations({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const key = ['integrations', projectId];
  const { error, run } = useCommandRunner([key, ['snapshot', projectId]], true);
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ integrations: IntegrationConnection[] }>(`/api/projects/${projectId}/integrations`),
    refetchInterval: 5000,
  });
  return (
    <section aria-labelledby="integrations-title">
      <h3 id="integrations-title">{t('integrations')}</h3>
      <p className="muted">{t('integrationsNote')}</p>
      {query.data?.integrations.length === 0 && <p>{t('integrationsEmpty')}</p>}
      <ul className="plain-list">
        {query.data?.integrations.map((c) => (
          <ConnectionRow
            key={c.id}
            connection={c}
            projectId={projectId}
            canManage={canManage}
            run={run}
          />
        ))}
      </ul>
      {canManage && <ConnectForm projectId={projectId} error={error} run={run} />}
    </section>
  );
}

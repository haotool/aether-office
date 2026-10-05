import { useState } from 'react';
import { Plus, ArrowUpRight } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import { execute } from '../api.js';
import { PageHeading, AvatarIcon, Badge, Modal, Field, Empty, useT } from '../ui.js';
export function Agents({
  snapshot,
  onSelect,
  onSaved,
  canWrite,
}: {
  snapshot: Snapshot;
  onSelect: (id: string) => void;
  onSaved: () => void;
  canWrite: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        title={t('team')}
        subtitle={`${snapshot.agents.length} ${t('agents')}`}
        action={
          <button className="primary" onClick={() => setAdding(true)} disabled={!canWrite}>
            <Plus size={16} />
            {t('addAgent')}
          </button>
        }
      />
      {snapshot.agents.length ? (
        <div className="agent-grid">
          {snapshot.agents.map((agent) => (
            <button className="agent-card" onClick={() => onSelect(agent.id)} key={agent.id}>
              <div className="agent-card-top">
                <AvatarIcon
                  species={agent.species}
                  color={agent.color}
                  name={agent.name}
                  size={44}
                />
                <ArrowUpRight size={17} />
              </div>
              <h3>{agent.name}</h3>
              <p>{agent.role}</p>
              <footer>
                <span className="provider-tag">{agent.provider.toUpperCase()}</span>
                <Badge state={agent.activity} />
              </footer>
            </button>
          ))}
        </div>
      ) : (
        <Empty title={t('empty')} />
      )}{' '}
      {adding && (
        <Modal title={t('addAgent')} onClose={() => setAdding(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const data = new FormData(e.currentTarget);
              try {
                await execute(
                  'agent.register',
                  {
                    name: data.get('name'),
                    role: data.get('role'),
                    provider: data.get('provider'),
                    species: data.get('species'),
                    color: data.get('color'),
                  },
                  snapshot.project.id,
                );
                onSaved();
                setAdding(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t('name')}>
              <input name="name" autoFocus required maxLength={160} />
            </Field>
            <Field label={t('role')}>
              <select name="role">
                {(['engineer', 'reviewer', 'coordinator', 'observer'] as const).map((role) => (
                  <option key={role} value={role}>
                    {t(role)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('provider')}>
              <select name="provider">
                {(snapshot.project.mode === 'demo'
                  ? ['demo']
                  : ['claude', 'codex', 'acp', 'observe']
                ).map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                    {p === 'acp' ? ` — ${t('acpNeedsConfig')}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field-row">
              <Field label={t('species')}>
                <select name="species">
                  {(
                    ['fox', 'rabbit', 'panda', 'cat', 'dog', 'raccoon', 'otter', 'bear'] as const
                  ).map((s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('color')}>
                <input type="color" name="color" defaultValue="#6ADDE8" />
              </Field>
            </div>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={busy}>
              {t('create')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

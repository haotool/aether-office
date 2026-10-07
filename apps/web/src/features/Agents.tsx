import { useState } from 'react';
import { Plus, ArrowUpRight } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import { execute } from '../api.js';
import { avatarState } from '../avatar/state.js';
import { Avatar } from './Avatar.js';
import { PageHeading, Badge, Modal, Field, Empty, useT, whyNot } from '../ui.js';

function AgentCard({
  agent,
  onSelect,
}: {
  agent: Snapshot['agents'][number];
  onSelect: (id: string) => void;
}) {
  return (
    <button className="agent-card" onClick={() => onSelect(agent.id)}>
      <div className="agent-card-top">
        <Avatar
          seed={agent.id}
          species={agent.species}
          size="card"
          state={avatarState(agent.activity)}
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
  );
}

/** The fields of the add-agent form, uncontrolled: the form's submit reads them by name. */
function AgentFields({ mode }: { mode: Snapshot['project']['mode'] }) {
  const t = useT();
  const providers = mode === 'demo' ? ['demo'] : ['claude', 'codex', 'acp', 'observe'];
  return (
    <>
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
          {providers.map((p) => (
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
            {(['fox', 'rabbit', 'panda', 'cat', 'dog', 'raccoon', 'otter', 'bear'] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={t('color')}>
          <input type="color" name="color" defaultValue="#6ADDE8" />
        </Field>
      </div>
    </>
  );
}

function AddAgentModal({
  snapshot,
  onSaved,
  onClose,
}: {
  snapshot: Snapshot;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (data: FormData) => {
    setBusy(true);
    setError('');
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
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('addAgent')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <AgentFields mode={snapshot.project.mode} />
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
  );
}

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
  return (
    <>
      <PageHeading
        title={t('team')}
        subtitle={`${snapshot.agents.length} ${t('agents')}`}
        action={
          <button
            className="primary"
            onClick={() => setAdding(true)}
            disabled={!canWrite}
            {...whyNot(canWrite, t('needOperator'))}
          >
            <Plus size={16} />
            {t('addAgent')}
          </button>
        }
      />
      {snapshot.agents.length ? (
        <div className="agent-grid">
          {snapshot.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <Empty title={t('empty')} />
      )}{' '}
      {adding && (
        <AddAgentModal snapshot={snapshot} onSaved={onSaved} onClose={() => setAdding(false)} />
      )}
    </>
  );
}

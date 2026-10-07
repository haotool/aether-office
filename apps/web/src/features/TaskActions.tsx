import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Snapshot, Work } from '@aether/contracts';
import { execute } from '../api.js';
import { Field, useT } from '../ui.js';
import { useCapabilities } from './CapabilityMatrix.js';

/** What the action forms of one task share: its command runner and who may do what. */
export type TaskActionProps = {
  snapshot: Snapshot;
  work: Work;
  canWrite: boolean;
  busy: boolean;
  command: TaskCommand;
};

export type TaskCommand = (
  type: 'work.dependencies' | 'work.assign' | 'work.retry' | 'work.extend' | 'work.cancel',
  data: Record<string, unknown>,
  work: Work,
  clearError?: boolean,
) => Promise<void>;

/** Runs a command on a task (at the version on screen), keeping the busy flag and the last error for the modal. */
export function useTaskCommand(projectId: string, onSaved: () => void) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const command: TaskCommand = async (type, data, work, clearError = true) => {
    setBusy(true);
    if (clearError) setError('');
    try {
      await execute(type, { workId: work.id, ...data }, projectId, work.version);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, busy, command };
}

export function DependencyEditor({ snapshot, work, canWrite, busy, command }: TaskActionProps) {
  const t = useT();
  return (
    <form
      key={`dependencies-${work.id}-${work.version}`}
      onSubmit={(e) => {
        e.preventDefault();
        const dependencies = new FormData(e.currentTarget).getAll('dependencies');
        void command('work.dependencies', { dependencies }, work);
      }}
    >
      <Field label={t('editDependencies')}>
        <select
          name="dependencies"
          multiple
          defaultValue={snapshot.dependencies
            .filter((d) => d.workId === work.id)
            .map((d) => d.dependsOn)}
        >
          {snapshot.work
            .filter((w) => w.id !== work.id)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
        </select>
      </Field>
      <button className="secondary" disabled={!canWrite || busy}>
        {t('saveDependencies')}
      </button>
    </form>
  );
}

export function AssignForm({ snapshot, work, canWrite, busy, command }: TaskActionProps) {
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void command(
          'work.assign',
          { agentId: new FormData(e.currentTarget).get('agentId') },
          work,
        );
      }}
    >
      <Field label={t('chooseAgent')}>
        <select name="agentId" required>
          {snapshot.agents
            .filter((a) => a.mode !== 'observe')
            .map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {agent.provider}
              </option>
            ))}
        </select>
      </Field>
      <button className="primary" disabled={!canWrite || busy || !snapshot.agents.length}>
        {t('assign')}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}

/** Retry a failed or change-requested task, optionally resuming its session when the provider can. */
export function RetryControls({ snapshot, work, canWrite, busy, command }: TaskActionProps) {
  const t = useT();
  const [resume, setResume] = useState(false);
  const capabilities = useCapabilities();
  const provider = snapshot.agents.find((a) => a.id === work.assignee)?.provider;
  const canResume = !!provider && !!capabilities.data?.providers[provider]?.['resume'];
  return (
    <>
      {snapshot.project.mode === 'live' && (
        <label title={canResume ? undefined : t('resumeUnsupported')}>
          <input
            type="checkbox"
            checked={resume && canResume}
            disabled={!canResume}
            onChange={(e) => setResume(e.target.checked)}
          />
          {t('resumeSession')}
        </label>
      )}
      <button
        className="primary"
        disabled={!canWrite || busy || work.attempt >= work.maxAttempts}
        onClick={() => void command('work.retry', { resume }, work)}
      >
        {t('retry')} ({work.attempt}/{work.maxAttempts})
      </button>
    </>
  );
}

/** Shown once the attempts are used up: the limit, and (for those who may) a form to extend it. */
export function AttemptLimit({
  work,
  canExtend,
  busy,
  command,
}: Pick<TaskActionProps, 'work' | 'busy' | 'command'> & { canExtend: boolean }) {
  const t = useT();
  return (
    <>
      <p role="status">{t('attemptLimit')}</p>
      {canExtend && work.maxAttempts < 100 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void command(
              'work.extend',
              { reason: new FormData(e.currentTarget).get('reason') },
              work,
            );
          }}
        >
          <Field label={t('extensionReason')}>
            <textarea name="reason" required maxLength={2000} />
          </Field>
          <button className="secondary" disabled={busy}>
            {t('extendAttempt')}
          </button>
        </form>
      )}
    </>
  );
}

export function CancelControls({
  work,
  canWrite,
  busy,
  command,
}: Omit<TaskActionProps, 'snapshot'>) {
  const t = useT();
  return (
    <>
      <p className="muted">{t('cancelDependencyNote')}</p>
      <button
        className="secondary danger"
        disabled={!canWrite || busy}
        onClick={() => void command('work.cancel', {}, work, false)}
      >
        {t('cancel')}
      </button>
    </>
  );
}

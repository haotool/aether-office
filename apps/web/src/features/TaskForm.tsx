import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { execute } from '../api.js';
import { useFormCheck } from './use-form-check.js';
import { Modal, Field, useT } from '../ui.js';

/** Creating a work item from the form's values; the dialog closes once it is saved. */
function useCreateTask(projectId: string, onSaved: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async (values: FormData) => {
    setBusy(true);
    setError('');
    try {
      await execute(
        'work.create',
        {
          title: values.get('title'),
          description: values.get('description'),
          acceptance: values.get('acceptance'),
          dependencies: values.getAll('dependencies'),
          priority: Number(values.get('priority')),
        },
        projectId,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, create };
}

function TaskFields({
  snapshot,
  problem,
}: {
  snapshot: Snapshot;
  problem: ReturnType<typeof useFormCheck>['problem'];
}) {
  const t = useT();
  return (
    <>
      <Field label={t('workTitle')} error={problem('title')}>
        <input autoFocus required name="title" maxLength={160} />
      </Field>
      <Field label={t('description')}>
        <textarea name="description" rows={3} maxLength={16000} />
      </Field>
      <Field label={t('acceptance')} error={problem('acceptance')}>
        <textarea name="acceptance" required rows={3} maxLength={8000} />
      </Field>
      <div className="field-row">
        <Field label={t('priority')}>
          <select name="priority" defaultValue="1">
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </Field>
        <Field label={t('dependencies')} hint={t('dependenciesHint')}>
          <select name="dependencies" multiple size={4}>
            {snapshot.work.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

export function TaskForm({
  snapshot,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { busy, error, create } = useCreateTask(snapshot.project.id, onSaved, onClose);
  const { problem, check } = useFormCheck();
  return (
    <Modal title={t('newWork')} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (check(e.currentTarget)) void create(new FormData(e.currentTarget));
        }}
      >
        <TaskFields snapshot={snapshot} problem={problem} />
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t('loading') : t('create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

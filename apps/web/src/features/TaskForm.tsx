import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { execute } from '../api.js';
import { Modal, Field, useT } from '../ui.js';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={t('newWork')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
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
              snapshot.project.id,
            );
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('workTitle')}>
          <input autoFocus required name="title" maxLength={160} />
        </Field>
        <Field label={t('description')}>
          <textarea name="description" rows={3} maxLength={16000} />
        </Field>
        <Field label={t('acceptance')}>
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
          <Field label={t('dependencies')}>
            <select name="dependencies" multiple>
              {snapshot.work.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
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

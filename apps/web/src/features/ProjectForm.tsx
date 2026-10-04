import { useState } from 'react';
import { execute } from '../api.js';
import { useT, Modal, Field } from '../ui.js';

export function ProjectForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t('newProject')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await execute('project.create', {
              name: values.get('name'),
              ...(values.get('root') ? { root: values.get('root') } : {}),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('projectName')}>
          <input name="name" required autoFocus maxLength={160} />
        </Field>
        <Field label={t('root')}>
          <input name="root" maxLength={4096} />
        </Field>
        {error && <p role="alert">{error}</p>}
        <button className="primary full-width" disabled={busy}>
          {t('create')}
        </button>
      </form>
    </Modal>
  );
}

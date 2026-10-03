import { useState } from 'react';
import { execute } from '../api.js';
import { Field, Modal, useT } from '../ui.js';
import type { Key } from '../i18n.js';

const TEMPLATES = [
  ['claude_codex_review', 'wfClaudeCodex'],
  ['codex_claude_review', 'wfCodexClaude'],
  ['frontend_backend', 'wfFrontendBackend'],
  ['research_design_impl', 'wfResearchDesign'],
] as const satisfies readonly (readonly [string, Key])[];

export function WorkflowStart({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        {t('workflowStart')}
      </button>
      {open && (
        <Modal title={t('workflowStart')} onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setError('');
              try {
                await execute(
                  'workflow.start',
                  {
                    template: form.get('template'),
                    title: form.get('title'),
                    description: form.get('description'),
                    acceptance: form.get('acceptance'),
                  },
                  projectId,
                );
                setOpen(false);
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'REQUEST_FAILED');
              }
            }}
          >
            <Field label={t('workflowTemplate')}>
              <select name="template">
                {TEMPLATES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted">{t('workflowNote')}</p>
            <Field label={t('workTitle')}>
              <input name="title" required maxLength={160} />
            </Field>
            <Field label={t('description')}>
              <textarea name="description" maxLength={16000} />
            </Field>
            <Field label={t('acceptance')}>
              <textarea name="acceptance" required maxLength={6000} />
            </Field>
            {error && <p role="alert">{error}</p>}
            <button type="submit" className="primary">
              {t('workflowCreate')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

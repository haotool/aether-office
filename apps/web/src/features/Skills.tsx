import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Skill } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';

export function Skills({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const key = ['skills', projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`),
    refetchInterval: 5000,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    }
  };
  return (
    <section aria-labelledby="skills-title">
      <h2 id="skills-title">{t('skills')}</h2>
      <p className="muted">{t('skillsNote')}</p>
      {query.data?.skills.length === 0 && <p>{t('skillsEmpty')}</p>}
      <ul className="plain-list">
        {query.data?.skills.map((s) => (
          <li key={s.id} className="panel">
            <strong>{s.name}</strong> · {s.enabled ? t('skillEnabled') : t('skillDisabled')}
            <p>{s.description}</p>
            {s.warnings.map((w) => (
              <p key={w} role="note" className="muted">
                ⚠ {w}
              </p>
            ))}
            <details>
              <summary>{t('skillBody')}</summary>
              <pre className="preserve-space">{s.body}</pre>
            </details>
            <button
              disabled={!canManage}
              onClick={() =>
                run(() =>
                  execute(
                    'skill.toggle',
                    { skillId: s.id, enabled: !s.enabled },
                    projectId,
                    s.version,
                  ),
                )
              }
            >
              {s.enabled ? t('scheduleDisable') : t('scheduleEnable')}
            </button>
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void run(async () => {
              await execute(
                'skill.import',
                { content: new FormData(form).get('content') },
                projectId,
              );
              form.reset();
            });
          }}
        >
          <Field label={t('skillContent')}>
            <textarea name="content" required rows={8} maxLength={70000} spellCheck={false} />
          </Field>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('skillImport')}</button>
        </form>
      )}
    </section>
  );
}

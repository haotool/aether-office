import { useQuery } from '@tanstack/react-query';
import type { Skill } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';
import { EnableToggle, useCommandRunner } from './panel-kit.js';

function SkillRow({
  skill: s,
  canManage,
  onToggle,
}: {
  skill: Skill;
  canManage: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <li className="panel">
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
      <EnableToggle enabled={s.enabled} canManage={canManage} onToggle={onToggle} />
    </li>
  );
}

export function Skills({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const key = ['skills', projectId];
  const { error, run } = useCommandRunner([key], false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`),
    refetchInterval: 5000,
  });
  return (
    <section aria-labelledby="skills-title">
      <h2 id="skills-title">{t('skills')}</h2>
      <p className="muted">{t('skillsNote')}</p>
      {query.data?.skills.length === 0 && <p>{t('skillsEmpty')}</p>}
      <ul className="plain-list">
        {query.data?.skills.map((s) => (
          <SkillRow
            key={s.id}
            skill={s}
            canManage={canManage}
            onToggle={() =>
              void run(() =>
                execute(
                  'skill.toggle',
                  { skillId: s.id, enabled: !s.enabled },
                  projectId,
                  s.version,
                ),
              )
            }
          />
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

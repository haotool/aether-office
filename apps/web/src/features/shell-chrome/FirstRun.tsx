import { useT } from '../../ui/useT.js';
import { CopyCommand } from '../settings/kit.js';

const HOOKS = 'pnpm hooks install --project /path/to/repo';
const DOCTOR = 'pnpm run doctor';

export function FirstRun({ onNewProject }: { onNewProject?: (() => void) | undefined }) {
  const t = useT();
  return (
    <section className="first-run u-card" aria-labelledby="first-run-title">
      <h2 id="first-run-title">{t('frTitle')}</h2>
      <p>{t('frLead')}</p>
      <ol className="first-run-steps">
        <li>
          <p>{t('frStep1')}</p>
          <CopyCommand command="claude" />
          <CopyCommand command="codex" />
        </li>
        <li>
          <p>{t('frStep2')}</p>
        </li>
        <li>
          <p>{t('frStep3')}</p>
          <CopyCommand command={HOOKS} />
        </li>
      </ol>
      <p>{t('frDoctor')}</p>
      <CopyCommand command={DOCTOR} />
      {onNewProject && (
        <button className="secondary" onClick={onNewProject}>
          {t('frCreate')}
        </button>
      )}
    </section>
  );
}

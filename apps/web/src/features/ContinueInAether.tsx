import type { AttributedSession } from '@aether/contracts';
import { useT } from '../ui.js';
import { useContinue } from './use-continue.js';

/**
 * For a session AETHER only watches: start a new terminal in AETHER that resumes (or forks) it (see use-continue.ts). The
 * new session then shows here with a composer.
 */
export function ContinueInAether({
  session,
  projectId,
}: {
  session: AttributedSession;
  projectId: string;
}) {
  const t = useT();
  const { loaded, allowed, target, busy, message, start } = useContinue(session, projectId);
  if (!loaded) return null;
  if (!target) return <p>{t('continueNoProfile')}</p>;
  return (
    <>
      <p>{t(session.process === 'running' ? 'continueRunning' : 'continueNote')}</p>
      <div className="session-footer-actions">
        <button
          disabled={!allowed || busy || session.process === 'running'}
          onClick={() => void start(false)}
        >
          {t('continueHere')}
        </button>
        <button className="secondary" disabled={!allowed || busy} onClick={() => void start(true)}>
          {t('forkHere')}
        </button>
      </div>
      {!allowed && <p>{t('continueRole')}</p>}
      {message && <p role="status">{message}</p>}
    </>
  );
}

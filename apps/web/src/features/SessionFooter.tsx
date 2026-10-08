import { useState, type ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AttributedSession } from '@aether/contracts';
import { copyText } from '../browser-compat.js';
import { sessionCommands } from '../localSessions.js';
import { useT } from '../ui/useT.js';
import { Composer } from './Composer.js';
import { ContinueInAether } from './ContinueInAether.js';
import { useSessionTerminal } from './use-drive.js';

type SessionFooterProps = {
  session: AttributedSession | null;
  projectId: string;
  /** Is the session working now: the composer offers Stop in place of Send. */
  working?: boolean;
  composer?: ReactNode;
};

/**
 * The foot of a conversation. A session that runs in an AETHER terminal gets the composer (the server says which
 * terminal, by the session's process). A session AETHER only watches (started in some other terminal) gets no composer:
 * AETHER cannot type into it, and a text box that pretended to would lose what was typed. It gets the honest
 * alternatives: start a new AETHER terminal that resumes or forks it, or the provider's own commands to continue it
 * where it lives.
 *
 * `composer` lets a caller supply its own input, which then replaces all of this.
 */
export function SessionFooter({
  session,
  projectId,
  working = false,
  composer,
}: SessionFooterProps) {
  const t = useT();
  const [copied, setCopied] = useState('');
  const { drive } = useSessionTerminal(session?.key ?? null);
  if (composer) return <footer className="session-footer">{composer}</footer>;
  if (session && drive)
    return (
      <footer className="session-footer composer-footer">
        <Composer session={session} drive={drive} working={working} />
      </footer>
    );
  if (!session)
    return (
      <footer className="session-footer">
        <p>{t('convManaged')}</p>
        <Link className="secondary" to={`/messages?project=${projectId}`}>
          <MessageSquare size={15} />
          {t('messages')}
        </Link>
      </footer>
    );
  const commands = sessionCommands(session);
  const copy = async (id: 'resume' | 'fork') => {
    setCopied((await copyText(commands[id])) ? id : '');
  };
  return (
    <footer className="session-footer">
      <p>{t('convReadOnly')}</p>
      <ContinueInAether session={session} projectId={projectId} />
      <div className="session-footer-actions">
        <button className="secondary" onClick={() => void copy('resume')}>
          {copied === 'resume' ? t('copied') : t('copyResume')}
        </button>
        <button className="secondary" onClick={() => void copy('fork')}>
          {copied === 'fork' ? t('copied') : t('copyFork')}
        </button>
      </div>
    </footer>
  );
}

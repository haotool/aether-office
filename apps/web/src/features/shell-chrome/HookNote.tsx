import type { AttributedSession } from '@aether/contracts';
import { shQuote } from '@aether/kernel';
import { useT } from '../../ui/useT.js';
import { CopyCommand } from '../settings/kit.js';

export const hookInstallCommand = (cwd: string) => `pnpm hooks install --project ${shQuote(cwd)}`;

export const needsHook = (session: AttributedSession, working: boolean) =>
  session.provider === 'claude' && session.hook === null && working;

export function HookNote({ session }: { session: AttributedSession }) {
  const t = useT();
  return (
    <aside className="hook-note" aria-label={t('hookNoteTitle')}>
      <strong>{t('hookNoteTitle')}</strong>
      <p>{t('hookNoteBody')}</p>
      <CopyCommand command={hookInstallCommand(session.cwd)} />
    </aside>
  );
}

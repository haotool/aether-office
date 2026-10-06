import type { AttributedSession } from '@aether/contracts';
import { useT } from '../ui.js';
import { CopyCommand } from './settings/kit.js';

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The command that installs the hooks for this session's project (copied as one line). */
export const hookInstallCommand = (cwd: string) => `pnpm hooks install --project ${quote(cwd)}`;

/**
 * Claude Code reports its subagents only through hooks. Without them a working Claude session may have a squad nobody
 * can see, so say so, with the command that fixes it. Codex needs no hook: its helpers are separate rollouts.
 */
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

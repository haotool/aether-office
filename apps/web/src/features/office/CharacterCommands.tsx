import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { Modal } from '../../ui/Modal.js';
import { useT } from '../../ui/useT.js';
import { ConfirmButtons } from '../shell-chrome/ConfirmButtons.js';
import type { CharacterCommand } from './CharacterMenu.js';
import { ClockOut } from '../operations/ClockOut.js';
import { StopSession } from '../operations/StopSession.js';
import { stopTerminal } from '../terminal/terminal-driver.js';

/** Confirms, then ends the AETHER terminal a session runs in (the same call as the composer's "Stop process"). */
function StopTerminal({
  command,
  onClose,
}: {
  command: Extract<CharacterCommand, { type: 'stop-terminal' }>;
  onClose: () => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      await stopTerminal(command.drive.projectId, command.drive.terminalId);
      await client.invalidateQueries({ queryKey: ['local-sessions'] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
      setBusy(false);
    }
  };
  return (
    <Modal title={t('composerStopProcess')} onClose={onClose}>
      <p>
        <b>{command.session.title ?? command.session.repo}</b>
      </p>
      <p>{t('composerStopConfirm')}</p>
      <ConfirmButtons
        error={error}
        busy={busy}
        confirmLabel={t('composerStopProcess')}
        onConfirm={() => void stop()}
        onCancel={onClose}
      />
    </Modal>
  );
}

/**
 * The dialog behind a menu or group action that needs one: stopping a terminal or a forgotten process (each with its
 * confirm), and sending sessions home (the clock-out flow, offered just these sessions; the server and the dialog keep
 * their guards: only a running session idle for a day or more, and only an owner).
 */
export function CharacterCommands({
  command,
  sessions,
  locale,
  onClose,
}: {
  command: CharacterCommand | null;
  sessions: readonly AttributedSession[];
  locale: 'zh-TW' | 'en';
  onClose: () => void;
}) {
  if (!command) return null;
  if (command.type === 'stop-terminal') return <StopTerminal command={command} onClose={onClose} />;
  if (command.type === 'stop-process')
    return <StopSession session={command.session} locale={locale} onClose={onClose} />;
  return <ClockOut sessions={sessions} only={command.keys} locale={locale} onClose={onClose} />;
}

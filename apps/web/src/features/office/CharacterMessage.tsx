import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import { uuid } from '../../lib/platform/browser-compat.js';
import { useT, useWhy } from '../../ui/useT.js';
import { ESC, sequenceFor } from '../conversation/composer-model.js';
import { useOutbox } from '../conversation/outbox.js';
import { writeSteps } from '../terminal/terminal-driver.js';
import type { Drive } from '../../hooks/use-drive.js';

/**
 * Types into the AETHER terminal a session runs in, through the same driver as the composer (a lease, one ordered run of
 * writes). A message goes in at once: it is never queued behind a working session, so the menu offers it only when the
 * session can take it. A sent message is put in the session's outbox, so the conversation shows it as pending until the
 * transcript does.
 */
export function useTerminalSend(
  session: AttributedSession | null,
  drive: Drive | null,
  userId: string,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (task: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await task();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    message: (text: string) =>
      run(async () => {
        const steps = sequenceFor(text);
        if (!session || !drive || steps.length === 0) throw new Error('EMPTY_MESSAGE');
        await writeSteps(drive.projectId, drive.terminalId, userId, steps);
        useOutbox
          .getState()
          .update(session.key, (list) => [
            ...list,
            { localId: uuid(), text, at: Date.now(), state: 'sent' },
          ]);
      }),
    escape: () =>
      run(async () => {
        if (!drive) throw new Error('TERMINAL_NOT_RUNNING');
        await writeSteps(drive.projectId, drive.terminalId, userId, [{ text: ESC, delayMs: 0 }]);
      }),
  };
}

/** The small inline composer of the character menu: one box, Enter sends, nothing queued. */
export function MessageBubble({
  onSend,
  busy,
  error,
}: {
  onSend: (text: string) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const t = useT();
  const whyNot = useWhy();
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && (await onSend(text))) setText('');
  };
  return (
    <form className="char-message" onSubmit={(e) => void submit(e)}>
      <textarea
        autoFocus
        rows={2}
        value={text}
        aria-label={t('charMessage')}
        placeholder={t('charMessagePlaceholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button
        type="submit"
        className="primary"
        disabled={busy || !text.trim()}
        {...whyNot([!busy, 'whyBusy'], [!!text.trim(), 'whyNoText'])}
      >
        <Send size={15} aria-hidden="true" />
        {t('send')}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

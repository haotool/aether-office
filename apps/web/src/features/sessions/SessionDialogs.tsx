import type { AttributedSession } from '@aether/contracts';
import type { Locale } from '../../lib/i18n/i18n.js';
import { ClockOutLazy } from '../operations/ClockOutLazy.js';
import { StopSession } from '../operations/StopSession.js';

/** The two dialogs a list of sessions opens: stopping one session, and clocking out the idle ones. */
export function SessionDialogs({
  sessions,
  locale,
  stopping,
  clockingOut,
  onStopClose,
  onClockOutClose,
}: {
  sessions: readonly AttributedSession[];
  locale: Locale;
  stopping: AttributedSession | null;
  clockingOut: boolean;
  onStopClose: () => void;
  onClockOutClose: () => void;
}) {
  return (
    <>
      {stopping && <StopSession session={stopping} locale={locale} onClose={onStopClose} />}
      {clockingOut && (
        <ClockOutLazy sessions={sessions} locale={locale} onClose={onClockOutClose} />
      )}
    </>
  );
}

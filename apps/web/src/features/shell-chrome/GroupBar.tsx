import { useState } from 'react';
import { Copy, DoorOpen, Pin, PinOff, X } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import type { GroupBarContext } from '@aether/office-scene';
import { copyText } from '../../lib/platform/browser-compat.js';
import { sessionCommands } from '../../lib/sessions/localSessions.js';
import { useT, useWhy } from '../../ui/useT.js';
import { groupActions, type Reason } from '../office/character-actions.js';
import { clockOutKeys, kindOf, sessionOf, useActor } from '../sessions/character-session.js';
import type { CharacterCommand } from '../office/CharacterMenu.js';

type Found = { id: string; session: AttributedSession | null }[];

type GroupBarProps = {
  ctx: GroupBarContext;
  sessions: readonly AttributedSession[];
  onCommand: (command: CharacterCommand) => void;
  onNotice: (message: string) => void;
};

/** Which of the picked characters have a session, which qualify to be sent home, and what the bar offers for them. */
function useGroupSelection(ctx: GroupBarContext, sessions: readonly AttributedSession[]) {
  const actor = useActor();
  const clock = new Set(clockOutKeys(sessions, ctx.ids));
  const found: Found = ctx.ids.map((id) => ({ id, session: sessionOf(sessions, { id }) }));
  const actions = groupActions(
    found.map(({ id, session }) => ({
      hasSession: session !== null && kindOf(id) === 'observed',
      clockOut: !!session && clock.has(session.key),
    })),
    actor.role,
    ctx.canPin,
  );
  return { clock, found, actions };
}

/** Copies the resume command of every picked session, one per line. */
function useCopyResumes(found: Found, onNotice: (message: string) => void) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const lines = found.flatMap(({ session }) =>
      session ? [sessionCommands(session).resume] : [],
    );
    const ok = await copyText(lines.join('\n'));
    setCopied(ok);
    if (ok) onNotice(t('copied'));
  };
  return { copied, copy };
}

type SendHomeProps = {
  count: number;
  reason?: Reason;
  clock: Set<string>;
  onCommand: GroupBarProps['onCommand'];
  t: ReturnType<typeof useT>;
};

/** Send-home control: owner-only clock-out for the selection. */
function GroupBarSendHome({ count, reason, clock, onCommand, t }: SendHomeProps) {
  return (
    <button
      type="button"
      aria-disabled={count === 0}
      title={reason ? t(reason) : undefined}
      onClick={() => count > 0 && onCommand({ type: 'send-home', keys: [...clock] })}
    >
      <DoorOpen size={16} aria-hidden="true" />
      {t('groupSendHome')}
      {count > 0 && ` (${count})`}
    </button>
  );
}

/**
 * The floating bar for the characters picked with Shift or a rectangle: send them home (the clock-out flow for those that
 * qualify, owner only), pin them to the wall, copy their resume commands, clear the selection.
 */
export function GroupBar({ ctx, sessions, onCommand, onNotice }: GroupBarProps) {
  const t = useT();
  const whyNot = useWhy();
  const { clock, found, actions } = useGroupSelection(ctx, sessions);
  const { copied, copy } = useCopyResumes(found, onNotice);
  return (
    <div className="group-bar" role="toolbar" aria-label={t('groupBarLabel')}>
      <span className="group-count" aria-live="polite">
        {ctx.ids.length} {t('groupSelected')}
      </span>
      <GroupBarSendHome
        count={actions.sendHome.count}
        reason={actions.sendHome.reason}
        clock={clock}
        onCommand={onCommand}
        t={t}
      />
      <button
        type="button"
        aria-disabled={!!actions.pin.reason}
        title={actions.pin.reason ? t(actions.pin.reason) : undefined}
        onClick={() => !actions.pin.reason && ctx.pin(true)}
      >
        <Pin size={16} aria-hidden="true" />
        {t('groupPin')}
      </button>
      <button type="button" onClick={() => ctx.pin(false)}>
        <PinOff size={16} aria-hidden="true" />
        {t('groupUnpin')}
      </button>
      <button
        type="button"
        aria-disabled={actions.copy.count === 0}
        {...whyNot([actions.copy.count > 0, 'whyNothingToCopy'])}
        onClick={() => void copy()}
      >
        <Copy size={16} aria-hidden="true" />
        {copied ? t('copied') : t('groupCopy')}
      </button>
      <button type="button" className="group-clear" onClick={ctx.clear}>
        <X size={16} aria-hidden="true" />
        {t('groupClear')}
      </button>
    </div>
  );
}

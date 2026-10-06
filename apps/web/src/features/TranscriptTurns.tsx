import { Fragment, memo, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { Ago } from './ConvTime.js';
import { LongText } from './LongText.js';
import { Markdown } from './Markdown.js';
import { MessageActions } from './MessageActions.js';
import { Notices } from './NoticeChips.js';
import { blockId, promptId } from './use-fresh-ids.js';
import {
  countCalls,
  groupSpanMs,
  shortDuration,
  shortTarget,
  toolSummaryText,
  type ToolCall,
  type Turn,
} from './turn-groups.js';

/** Consecutive tool calls as one line ("read 4 files · edited 2"); a tap lists each call with its target. */
function ToolGroup({ calls, fresh }: { calls: ToolCall[]; fresh: boolean }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const [open, setOpen] = useState(false);
  const { running, failed } = countCalls(calls);
  const [now, setNow] = useState(() => Date.now());
  // A running group's clock ticks; a finished one is static.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const span = groupSpanMs(calls, now);
  return (
    <div className={`tool-group ${running ? 'running' : ''} ${fresh ? 'enter' : ''}`}>
      <button className="tool-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tool-text">{toolSummaryText(calls, locale)}</span>
        {running && (
          <span className="tool-live">
            <i className="state-dot" />
            {t('convRunning')}
          </span>
        )}
        {failed > 0 && <span className="tool-failed">{`${failed} ${t('convFailed')}`}</span>}
        {span !== null && <time className="tool-span">{shortDuration(span)}</time>}
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <ul className="tool-rows">
          {calls.map((call, i) => (
            <li key={call.id ?? i} className={call.result?.error ? 'error' : ''}>
              <b>{call.name}</b>
              <span className="tool-target" title={call.summary ?? undefined}>
                {call.summary ? shortTarget(call.summary) : ''}
              </span>
              {call.result === null && <i className="state-dot" aria-label={t('convRunning')} />}
              {call.result?.error && <span className="tool-failed">{t('convFailed')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The line that marks where what you have not seen starts. */
function UnreadDivider() {
  const t = useT();
  return (
    <div className="unread-divider" role="separator">
      <span>{t('convUnread')}</span>
    </div>
  );
}

/**
 * A prompt, then what the agent said and did about it. What `isFresh` says arrived while the conversation was open
 * enters with a short rise, and a fresh reply fades in word by word. Every assistant message but the newest folds when tall.
 * `unreadId` is the first thing that happened after the person last looked: the divider goes just before it.
 */
export const TurnView = memo(function TurnView({
  turn,
  isFresh,
  newest,
  unreadId,
}: {
  turn: Turn;
  isFresh: (id: string) => boolean;
  newest: boolean;
  unreadId: string | null;
}) {
  const t = useT();
  const lastReply = newest ? turn.blocks.findLastIndex((b) => b.type === 'assistant') : -1;
  return (
    <article className="turn" data-turn tabIndex={-1}>
      {turn.user && (
        <>
          {unreadId === promptId(turn) && <UnreadDivider />}
          <div className={`msg user ${isFresh(promptId(turn)) ? 'enter' : ''}`} tabIndex={-1}>
            <span className="msg-who">
              {t('role_user')} <Ago at={turn.user.at} />
              <MessageActions text={turn.user.text} />
            </span>
            <p>{turn.user.text}</p>
          </div>
        </>
      )}
      {turn.blocks.map((block, i) => {
        const id = blockId(turn, i);
        const fresh = isFresh(id);
        const divider = unreadId === id && <UnreadDivider key={`${id}:unread`} />;
        if (block.type === 'notices')
          return (
            <Fragment key={i}>
              {divider}
              <Notices items={block.items} fresh={fresh} />
            </Fragment>
          );
        return block.type === 'assistant' ? (
          <Fragment key={i}>
            {divider}
            <div className={`msg assistant ${fresh ? 'enter' : ''}`} tabIndex={-1}>
              <span className="msg-who">
                {t('role_assistant')} <Ago at={block.at} />
                <MessageActions text={block.text} />
              </span>
              <LongText foldable={i !== lastReply}>
                <Markdown text={block.text} reveal={fresh} />
              </LongText>
            </div>
          </Fragment>
        ) : (
          <Fragment key={i}>
            {divider}
            <ToolGroup calls={block.calls} fresh={fresh} />
          </Fragment>
        );
      })}
    </article>
  );
});

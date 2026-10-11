import { Fragment, memo, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT, useLocale } from '../../ui/useT.js';
import { Ago } from './ConvTime.js';
import { LongText } from './LongText.js';
import { Markdown } from './Markdown.js';
import { MessageActions } from './MessageActions.js';
import { Notices } from '../feed/NoticeChips.js';
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

function ToolGroup({ calls, fresh }: { calls: ToolCall[]; fresh: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { running, failed } = countCalls(calls);
  const [now, setNow] = useState(() => Date.now());
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

function UnreadDivider() {
  const t = useT();
  return (
    <div className="unread-divider" role="separator">
      <span>{t('convUnread')}</span>
    </div>
  );
}

function UserMessage({
  turn,
  user,
  isFresh,
  unreadId,
}: {
  turn: Turn;
  user: NonNullable<Turn['user']>;
  isFresh: (id: string) => boolean;
  unreadId: string | null;
}) {
  const t = useT();
  return (
    <>
      {unreadId === promptId(turn) && <UnreadDivider />}
      <div className={`msg user ${isFresh(promptId(turn)) ? 'enter' : ''}`} tabIndex={-1}>
        <span className="msg-who">
          {t('role_user')} <Ago at={user.at} />
          <MessageActions text={user.text} />
        </span>
        <p>{user.text}</p>
      </div>
    </>
  );
}

function AssistantMessage({
  block,
  fresh,
  foldable,
}: {
  block: Extract<Turn['blocks'][number], { type: 'assistant' }>;
  fresh: boolean;
  foldable: boolean;
}) {
  const t = useT();
  return (
    <div className={`msg assistant ${fresh ? 'enter' : ''}`} tabIndex={-1}>
      <span className="msg-who">
        {t('role_assistant')} <Ago at={block.at} />
        <MessageActions text={block.text} />
      </span>
      <LongText foldable={foldable}>
        <Markdown text={block.text} reveal={fresh} />
      </LongText>
    </div>
  );
}

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
  const lastReply = newest ? turn.blocks.findLastIndex((b) => b.type === 'assistant') : -1;
  return (
    <article className="turn" data-turn tabIndex={-1}>
      {turn.user && (
        <UserMessage turn={turn} user={turn.user} isFresh={isFresh} unreadId={unreadId} />
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
            <AssistantMessage block={block} fresh={fresh} foldable={i !== lastReply} />
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

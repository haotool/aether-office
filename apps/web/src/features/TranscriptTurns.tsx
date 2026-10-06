import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { LongText } from './LongText.js';
import { blockId, promptId } from './use-fresh-ids.js';
import { Markdown } from './Markdown.js';
import {
  countCalls,
  groupSpanMs,
  shortDuration,
  shortTarget,
  toolSummaryText,
  type ToolCall,
  type Turn,
} from './turn-groups.js';

const clock = (at: number | null) =>
  at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

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

/**
 * A prompt, then what the agent said and did about it. What `isFresh` says arrived while the conversation was open
 * enters with a short rise, and a fresh reply fades in word by word. Every assistant message but the newest folds when tall.
 */
export function TurnView({
  turn,
  isFresh,
  newest,
}: {
  turn: Turn;
  isFresh: (id: string) => boolean;
  newest: boolean;
}) {
  const t = useT();
  const lastReply = newest ? turn.blocks.findLastIndex((b) => b.type === 'assistant') : -1;
  return (
    <article className="turn">
      {turn.user && (
        <div className={`msg user ${isFresh(promptId(turn)) ? 'enter' : ''}`}>
          <span className="msg-who">
            {t('role_user')} <time>{clock(turn.user.at)}</time>
          </span>
          <p>{turn.user.text}</p>
        </div>
      )}
      {turn.blocks.map((block, i) => {
        const fresh = isFresh(blockId(turn, i));
        return block.type === 'assistant' ? (
          <div key={i} className={`msg assistant ${fresh ? 'enter' : ''}`}>
            <span className="msg-who">
              {t('role_assistant')} <time>{clock(block.at)}</time>
            </span>
            <LongText foldable={i !== lastReply}>
              <Markdown text={block.text} reveal={fresh} />
            </LongText>
          </div>
        ) : (
          <ToolGroup key={i} calls={block.calls} fresh={fresh} />
        );
      })}
    </article>
  );
}

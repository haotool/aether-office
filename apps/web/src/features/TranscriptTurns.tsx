import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
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
function ToolGroup({ calls }: { calls: ToolCall[] }) {
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
    <div className={`tool-group ${running ? 'running' : ''}`}>
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

/** A prompt, then what the agent said and did about it. */
export function TurnView({ turn }: { turn: Turn }) {
  const t = useT();
  return (
    <article className="turn">
      {turn.user && (
        <div className="msg user">
          <span className="msg-who">
            {t('role_user')} <time>{clock(turn.user.at)}</time>
          </span>
          <p>{turn.user.text}</p>
        </div>
      )}
      {turn.blocks.map((block, i) =>
        block.type === 'assistant' ? (
          <div key={i} className="msg assistant">
            <span className="msg-who">
              {t('role_assistant')} <time>{clock(block.at)}</time>
            </span>
            <Markdown text={block.text} />
          </div>
        ) : (
          <ToolGroup key={i} calls={block.calls} />
        ),
      )}
    </article>
  );
}

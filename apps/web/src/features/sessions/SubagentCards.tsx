import { memo, useEffect, useRef } from 'react';
import type { AttributedSession } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { callsOf, elapsedLabel, type SquadRow, type SquadView } from '../feed/feed-squads.js';
import { Elapsed, SubDot, sameRow } from '../squad/SquadParts.js';
import { STATUS_KEY, rowName, toolsText } from '../squad/squad-text.js';

type Call = ReturnType<typeof callsOf>[number];

/** The facts of a subagent as a list: what the hook and the transcript know, and nothing they do not. */
export function SubagentFacts({ row, calls }: { row: SquadRow; calls: readonly Call[] }) {
  const t = useT();
  const tools = toolsText(t, row);
  const clock = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const facts: [string, string | null][] = [
    [t('subStatus'), t(STATUS_KEY[row.status])],
    [t('subStarted'), row.startedAt === null ? null : clock(row.startedAt)],
    [t('subDuration'), elapsedLabel(row, Date.now())],
    [t('subToolCalls'), tools],
    [t('subLastTool'), row.lastTool],
    [t('subTask'), row.task],
    [t('subResult'), row.result],
  ];
  return (
    <>
      <dl className="sub-facts">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {calls.length > 0 ? (
        <ul className="sub-calls" aria-label={t('subRecentCalls')}>
          {calls.map((c, i) => (
            <li key={`${c.at}:${i}`}>
              <strong>{c.tool}</strong>
              {c.target && <code>{c.target}</code>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sub-none">{t('subNoCalls')}</p>
      )}
    </>
  );
}

/** One spawn: a folded card (type, status, how long, tool calls) that opens to its facts and its own recent calls. */
const SubagentCard = memo(
  function SubagentCard({
    row,
    calls,
    picked,
  }: {
    row: SquadRow;
    calls: readonly Call[];
    picked: boolean;
  }) {
    const t = useT();
    const card = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
      if (!picked || !card.current) return;
      card.current.open = true;
      card.current.scrollIntoView({ block: 'nearest' });
    }, [picked]);
    const tools = toolsText(t, row);
    return (
      <details
        ref={card}
        className="sub-card"
        data-status={row.status}
        data-fading={row.fading || undefined}
        data-picked={picked || undefined}
        data-sub={row.id}
      >
        <summary>
          <SubDot status={row.status} />
          <strong>{rowName(row)}</strong>
          <span className="sub-status">{t(STATUS_KEY[row.status])}</span>
          {tools && <span className="sub-tools">{tools}</span>}
          <Elapsed row={row} />
        </summary>
        <SubagentFacts row={row} calls={calls} />
      </details>
    );
  },
  (a, b) =>
    a.picked === b.picked &&
    sameRow(a.row, b.row) &&
    a.calls.length === b.calls.length &&
    a.calls.every((c, i) => {
      const other = b.calls[i];
      return other !== undefined && c.at === other.at && c.tool === other.tool;
    }),
);

/** "Subagent activity": a card per spawn, under the transcript (the transcript itself is never behind a fold). */
export function SubagentCards({
  view,
  session,
  picked,
}: {
  view: SquadView;
  session: AttributedSession;
  picked: string | null;
}) {
  const t = useT();
  return (
    <section className="sub-cards" data-squad={view.hue} aria-label={t('subActivity')}>
      <h3>{t('subActivity')}</h3>
      {view.rows.map((row) => (
        <SubagentCard
          key={row.id}
          row={row}
          calls={callsOf(session, row.id)}
          picked={picked === row.id}
        />
      ))}
    </section>
  );
}

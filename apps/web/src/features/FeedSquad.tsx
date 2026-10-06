import {
  memo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { ChevronDown, CornerDownRight } from 'lucide-react';
import { useT } from '../ui.js';
import { FeedRowBody } from './FeedRow.js';
import type { FeedItem } from './feed-model.js';
import type { SquadRow } from './feed-squads.js';
import { Elapsed, SubDot, sameRow } from './SquadParts.js';
import { STATUS_KEY, fmt, rowName, squadSummary, toolsText } from './squad-text.js';
import { treeNav } from './tree-nav.js';

type Open = (agentId: string) => void;

/** One subagent under its supervisor: status dot, type, how long it has run, tool calls; a button-like tree item. */
const SquadRowView = memo(
  function SquadRowView({
    row,
    index,
    size,
    supervisorLabel,
    tabIndex,
    onOpen,
  }: {
    row: SquadRow;
    index: number;
    size: number;
    supervisorLabel: string;
    tabIndex: 0 | -1;
    onOpen: Open;
  }) {
    const t = useT();
    const tools = toolsText(t, row);
    const detail = row.result ?? row.task;
    // A finished subagent has left the office, so there is no member to open: its supervisor holds the record.
    const target = row.status === 'finished' ? row.supervisor : row.id;
    return (
      <div
        role="treeitem"
        aria-level={2}
        aria-posinset={index + 1}
        aria-setsize={size}
        tabIndex={tabIndex}
        className="squad-row"
        data-agent={row.id}
        data-status={row.status}
        data-fading={row.fading || undefined}
        onClick={() => onOpen(target)}
      >
        <SubDot status={row.status} />
        <span className="sub-main">
          <span className="sub-top">
            <strong title={rowName(row)}>{rowName(row)}</strong>
            <Elapsed row={row} />
          </span>
          <span className="sub-meta">
            <span className="sub-status">{t(STATUS_KEY[row.status])}</span>
            {tools && <span>{tools}</span>}
            {row.lastTool && row.status !== 'finished' && (
              <span className="sub-last">{row.lastTool}</span>
            )}
          </span>
          {detail && <span className="sub-text">{detail}</span>}
          <span className="visually-hidden">{fmt(t('subOfName'), { name: supervisorLabel })}</span>
        </span>
      </div>
    );
  },
  (a, b) =>
    sameRow(a.row, b.row) &&
    a.index === b.index &&
    a.size === b.size &&
    a.supervisorLabel === b.supervisorLabel &&
    a.tabIndex === b.tabIndex &&
    a.onOpen === b.onOpen,
);

/**
 * A supervisor and its subagents as a tree: the supervisor row (level 1, opens or folds) and one nested row per subagent
 * (level 2). One item is the tab stop; Up and Down, Home and End move, Right opens or enters, Left folds or goes to the
 * parent, Enter opens the item.
 */
export function FeedSquad({
  item,
  open,
  onToggle,
  onOpen,
}: {
  item: FeedItem;
  open: boolean;
  onToggle: (sessionKey: string, open: boolean) => void;
  onOpen: Open;
}) {
  const t = useT();
  const squad = item.squad!;
  const tree = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(item.agent.id);
  const ids = [item.agent.id, ...(open ? squad.rows.map((r) => r.id) : [])];
  const current = ids.includes(active) ? active : item.agent.id;
  const tab = (id: string) => (id === current ? 0 : -1);

  const items = () => [...(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
  const onKeyDown = (e: KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!el) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
      return;
    }
    const all = items();
    const expanded = el.getAttribute('aria-expanded');
    const action = treeNav(
      e.key,
      all.indexOf(el),
      all.map((i) => Number(i.getAttribute('aria-level'))),
      expanded === null ? null : expanded === 'true',
    );
    if (!action) return;
    e.preventDefault();
    if ('focus' in action) all[action.focus]?.focus();
    else onToggle(item.key, action.open);
  };
  const onFocus = (e: FocusEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')?.dataset[
      'agent'
    ];
    if (id) setActive(id);
  };
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    onToggle(item.key, !open);
  };

  return (
    <div
      ref={tree}
      role="tree"
      className="squad-tree"
      aria-label={fmt(t('squadOf'), { name: item.label })}
      data-squad={squad.hue}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div
        role="treeitem"
        aria-level={1}
        aria-expanded={open}
        aria-posinset={1}
        aria-setsize={1}
        tabIndex={tab(item.agent.id)}
        className={`feed-row bucket-${item.bucket} ${item.stale ? 'stale' : ''}`}
        data-agent={item.agent.id}
        onClick={() => onOpen(item.agent.id)}
      >
        <FeedRowBody
          item={item}
          extra={
            <span className="feed-squad">
              <CornerDownRight size={12} aria-hidden="true" />
              <span className="squad-chip">{squadSummary(t, squad)}</span>
              <button
                type="button"
                className="squad-toggle"
                tabIndex={-1}
                aria-hidden="true"
                data-open={open}
                title={t(open ? 'squadHide' : 'squadShow')}
                onClick={toggle}
              >
                <ChevronDown size={14} />
              </button>
            </span>
          }
        />
      </div>
      {open &&
        squad.rows.map((row, i) => (
          <SquadRowView
            key={row.id}
            row={row}
            index={i}
            size={squad.rows.length}
            supervisorLabel={item.label}
            tabIndex={tab(row.id)}
            onOpen={onOpen}
          />
        ))}
    </div>
  );
}

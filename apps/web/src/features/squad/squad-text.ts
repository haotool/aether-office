import type { Subagent } from '@aether/contracts';
import type { Key } from '../../lib/i18n/i18n.js';
import type { SquadRow, SquadView } from '../feed/feed-squads.js';

type Translate = (key: Key) => string;

/** Fills `{name}`-style holes in a locale string (word order differs between the locales, so no concatenation). */
export const fmt = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

export const STATUS_KEY: Record<Subagent['status'], Key> = {
  running: 'subRunning',
  waiting_permission: 'subWaiting',
  finished: 'subFinished',
  unknown: 'subActive',
};

/** "3 subagents · 2 working", "1 subagent · all finished", "4 subagents · 3 working · 1 waiting for approval". */
export function squadSummary(
  t: Translate,
  view: Pick<SquadView, 'rows' | 'live' | 'waiting'>,
): string {
  const n = view.rows.length;
  return [
    `${n} ${t(n === 1 ? 'squadOne' : 'squadMany')}`,
    view.live ? `${view.live} ${t('squadWorking')}` : t('squadAllFinished'),
    view.waiting ? `${view.waiting} ${t('subWaitingShort')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "14 tool calls", or null when the source does not count them. */
export const toolsText = (t: Translate, row: Pick<SquadRow, 'toolCount'>): string | null =>
  row.toolCount === null
    ? null
    : `${row.toolCount} ${t(row.toolCount === 1 ? 'subToolOne' : 'subToolMany')}`;

/** The row's name: its type, and the nickname Codex gave it when it has one. */
export const rowName = (row: Pick<SquadRow, 'type' | 'nickname'>) =>
  row.nickname ? `${row.type} · ${row.nickname}` : row.type;

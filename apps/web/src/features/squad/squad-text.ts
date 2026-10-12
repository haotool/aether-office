import type { Subagent } from '@aether/contracts';
import type { Key } from '../../lib/i18n/i18n.js';
import type { SquadRow, SquadView } from '../feed/feed-squads.js';

type Translate = (key: Key) => string;

export const fmt = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

export const STATUS_KEY: Record<Subagent['status'], Key> = {
  running: 'subRunning',
  waiting_permission: 'subWaiting',
  finished: 'subFinished',
  unknown: 'subActive',
};

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

export const toolsText = (t: Translate, row: Pick<SquadRow, 'toolCount'>): string | null =>
  row.toolCount === null
    ? null
    : `${row.toolCount} ${t(row.toolCount === 1 ? 'subToolOne' : 'subToolMany')}`;

export const rowName = (row: Pick<SquadRow, 'type' | 'nickname'>) =>
  row.nickname ? `${row.type} · ${row.nickname}` : row.type;

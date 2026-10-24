import type { Agent, LocalSession } from '@aether/contracts';
import { activityOf } from '../../lib/sessions/session-attention.js';
import type { Ask } from '../shell-chrome/need-banner.js';

type LiteRow = { session: LocalSession; asking: boolean; activity: Agent['activity'] };

export function liteRows(
  sessions: readonly LocalSession[] | undefined,
  asks: readonly Ask[],
  now: number,
): LiteRow[] {
  const order = new Map(asks.map((a, i) => [a.key, i]));
  return (sessions ?? [])
    .map((session) => ({
      session,
      asking: order.has(session.key),
      activity: activityOf(session, now),
    }))
    .filter((r) => r.asking || r.activity !== 'offline')
    .sort(
      (a, b) =>
        (order.get(a.session.key) ?? Infinity) - (order.get(b.session.key) ?? Infinity) ||
        b.session.mtime - a.session.mtime,
    );
}

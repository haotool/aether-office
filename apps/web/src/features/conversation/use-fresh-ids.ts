import { useRef } from 'react';
import type { Turn } from '../conversation/turn-groups.js';

export const promptId = (turn: Turn) => `${turn.id}:prompt`;
export const blockId = (turn: Turn, index: number) => `${turn.id}:${index}`;
export const turnIds = (turn: Turn): string[] => [
  ...(turn.user ? [promptId(turn)] : []),
  ...turn.blocks.map((_, i) => blockId(turn, i)),
];

/**
 * What was there at the first look is history and is never animated; `null` ids (nothing loaded yet) do not count as a
 * first look.
 */
export function useFreshIds(scope: string, ids: readonly string[] | null): (id: string) => boolean {
  const state = useRef<{ scope: string; seen: Set<string>; fresh: Set<string> } | null>(null);
  if (ids) {
    if (state.current?.scope !== scope)
      state.current = { scope, seen: new Set(ids), fresh: new Set() };
    else
      for (const id of ids)
        if (!state.current.seen.has(id)) {
          state.current.seen.add(id);
          state.current.fresh.add(id);
        }
  }
  return (id) => state.current?.fresh.has(id) ?? false;
}

export function firstUnreadId(turns: readonly Turn[], seenAt: number): string | null {
  if (!seenAt) return null;
  const items = turns.flatMap((turn) => [
    ...(turn.user ? [{ id: promptId(turn), at: turn.user.at }] : []),
    ...turn.blocks.map((block, i) => ({ id: blockId(turn, i), at: block.at })),
  ]);
  const at = items.findIndex((item) => item.at !== null && item.at > seenAt);
  if (at <= 0) return null;
  return items[at]?.id ?? null;
}

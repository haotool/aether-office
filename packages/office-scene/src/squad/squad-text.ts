// The words of the squad scene, in both locales: the zone label and the lines of the activity log (relation rows R1 and R6).
import type { SquadEvent } from './use-squad.js';

/**
 * "Squad of main, 3 working" (+2 more when some stand as silhouettes, and the beam's readout when there is one, see
 * beam-readout.ts): the zone label's accessible name.
 */
export function zoneName(
  zh: boolean,
  supervisor: string,
  working: number,
  overflow: number,
  beam: string | null = null,
): string {
  const more = overflow > 0 ? (zh ? `，另有 ${overflow} 位` : `, ${overflow} more`) : '';
  const rate = beam ? (zh ? `，${beam}` : `, ${beam}`) : '';
  return zh
    ? `${supervisor} 的小隊，${working} 位運作中${more}${rate}`
    : `Squad of ${supervisor}, ${working} working${more}${rate}`;
}

/** What the label shows: short, the name is in the accessible name. */
export function zoneBadge(zh: boolean, members: number, overflow: number): string {
  const extra = overflow > 0 ? ` +${overflow}` : '';
  return zh ? `小隊 ×${members}${extra}` : `Squad ${members}${extra}`;
}

/** One line of the log: who joined whose squad, or left it. */
export function eventLine(zh: boolean, event: SquadEvent, supervisorName: string): string {
  if (event.kind === 'joined')
    return zh
      ? `${event.type} 加入了 ${supervisorName} 的小隊`
      : `${event.type} joined ${supervisorName}'s squad`;
  return zh ? `${event.type} 離開了小隊` : `${event.type} left the squad`;
}

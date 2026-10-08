// The words of the squad scene, in both locales: the zone label and the lines of the activity log (relation rows R1 and R6).
import type { SquadEvent } from './use-squad.js';
import { sceneT, sceneText } from '../i18n/scene-text.js';

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
  const t = sceneT(zh);
  const more = overflow > 0 ? t('squad.more', { n: overflow }) : '';
  const rate = beam ? t('squad.rate', { beam }) : '';
  return t('squad.zoneName', { supervisor, working, more, rate });
}

/** What the label shows: short, the name is in the accessible name. */
export function zoneBadge(zh: boolean, members: number, overflow: number): string {
  const extra = overflow > 0 ? ` +${overflow}` : '';
  return sceneText(zh, 'squad.badge', { members, extra });
}

/** One line of the log: who joined whose squad, or left it. */
export function eventLine(zh: boolean, event: SquadEvent, supervisorName: string): string {
  if (event.kind === 'joined')
    return sceneText(zh, 'squad.joined', { type: event.type, supervisor: supervisorName });
  return sceneText(zh, 'squad.left', { type: event.type });
}

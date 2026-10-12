import type { SquadEvent } from './use-squad.js';
import { sceneT, sceneText } from '../i18n/scene-text.js';

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

export function zoneBadge(zh: boolean, members: number, overflow: number): string {
  const extra = overflow > 0 ? ` +${overflow}` : '';
  return sceneText(zh, 'squad.badge', { members, extra });
}

export function eventLine(zh: boolean, event: SquadEvent, supervisorName: string): string {
  if (event.kind === 'joined')
    return sceneText(zh, 'squad.joined', { type: event.type, supervisor: supervisorName });
  return sceneText(zh, 'squad.left', { type: event.type });
}

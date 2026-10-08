// The words of the hand-over, in both locales, for the scene's one aria log (relation row R4).
import type { StampKind } from './stamp.js';
import { sceneText } from '../../i18n/scene-text.js';

/** "Explore handed over its result" (and what the stamp said, when the result was flagged as an error). */
export function handoverLine(zh: boolean, type: string, kind: StampKind): string {
  return sceneText(zh, kind === 'returned' ? 'handover.returned' : 'handover.received', { type });
}

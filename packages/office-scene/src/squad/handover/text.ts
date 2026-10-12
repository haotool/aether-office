import type { StampKind } from './stamp.js';
import { sceneText } from '../../i18n/scene-text.js';

export function handoverLine(zh: boolean, type: string, kind: StampKind): string {
  return sceneText(zh, kind === 'returned' ? 'handover.returned' : 'handover.received', { type });
}

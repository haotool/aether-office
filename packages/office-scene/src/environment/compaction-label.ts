import { sceneText } from '../i18n/scene-text.js';
import type { SceneCompaction } from './context.js';

export function compactionLabel(c: SceneCompaction, zh: boolean): string {
  const fall = c.fromPct !== null && c.toPct !== null ? Math.round(c.fromPct - c.toPct) : 0;
  const base = sceneText(zh, 'context.compacted');
  return fall > 0 ? `${base} −${fall}%` : base;
}

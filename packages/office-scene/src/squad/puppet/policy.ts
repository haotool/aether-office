import type { Quality } from '../../scene/scene-types.js';

export const stringsEnabled = (
  quality: Quality,
  prefs: { relation?: boolean; strings?: boolean } | undefined,
): boolean => quality !== 'low' && prefs?.relation !== false && prefs?.strings !== false;

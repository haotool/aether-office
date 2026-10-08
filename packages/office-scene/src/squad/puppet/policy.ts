import type { Quality } from '../../scene/scene-types.js';

/**
 * Whether the puppet strings are drawn at all: not on the low tier, and not when the person turned the relation effects
 * or the strings off. Reduced motion and Calm draw them still (see PuppetStrings).
 */
export const stringsEnabled = (
  quality: Quality,
  prefs: { relation?: boolean; strings?: boolean } | undefined,
): boolean => quality !== 'low' && prefs?.relation !== false && prefs?.strings !== false;

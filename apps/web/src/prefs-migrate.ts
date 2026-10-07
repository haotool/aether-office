import { DEFAULT_LIFE_PREFS, LIFE_CATEGORIES, type LifePrefs } from '@aether/office-scene/model';

/**
 * The version of the stored preferences. 1 added `life` (the office-life settings); `intro` was added before it without a
 * version, because a missing key simply keeps its default.
 */
export const PREFS_VERSION = 1;

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** A stored `life` made safe to use: anything missing or of the wrong kind falls back to its default. */
export function normalizeLife(raw: unknown, calmDefault: boolean): LifePrefs {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const categories = (
    typeof stored['categories'] === 'object' && stored['categories'] !== null
      ? stored['categories']
      : {}
  ) as Record<string, unknown>;
  return {
    calm: flag(stored['calm'], calmDefault),
    relation: flag(stored['relation'], DEFAULT_LIFE_PREFS.relation),
    frequency:
      stored['frequency'] === 'normal' || stored['frequency'] === 'rare'
        ? stored['frequency']
        : DEFAULT_LIFE_PREFS.frequency,
    categories: Object.fromEntries(
      LIFE_CATEGORIES.map((id) => [id, flag(categories[id], DEFAULT_LIFE_PREFS.categories[id])]),
    ) as LifePrefs['categories'],
  };
}

/**
 * Brings stored preferences of an older version up to this one. Coming from before 1, Calm mode starts on for a person
 * whose stored preference already asks for reduced motion, as it does for a new one.
 */
export function migratePreferences(persisted: unknown, version: number): Record<string, unknown> {
  const state = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Record<
    string,
    unknown
  >;
  if (version >= PREFS_VERSION) return state;
  return { ...state, life: normalizeLife(state['life'], state['reducedMotion'] === true) };
}

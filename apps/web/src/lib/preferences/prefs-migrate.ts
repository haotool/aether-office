import { DEFAULT_LIFE_PREFS, LIFE_CATEGORIES, type LifePrefs } from '@aether/office-scene/model';

/** 1 added `life`; a key that is missing keeps its default. */
export const PREFS_VERSION = 1;

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

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

export function migratePreferences(persisted: unknown, version: number): Record<string, unknown> {
  const state = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Record<
    string,
    unknown
  >;
  if (version >= PREFS_VERSION) return state;
  return { ...state, life: normalizeLife(state['life'], state['reducedMotion'] === true) };
}

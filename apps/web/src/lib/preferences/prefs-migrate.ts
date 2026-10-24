/** 1 added `life`; a key that is missing keeps its default. */
export const PREFS_VERSION = 1;

export type LifePrefs = { calm: boolean; relation: boolean };
export const DEFAULT_LIFE_PREFS: LifePrefs = { calm: false, relation: true };

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function normalizeLife(raw: unknown, calmDefault: boolean): LifePrefs {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    calm: flag(stored['calm'], calmDefault),
    relation: flag(stored['relation'], DEFAULT_LIFE_PREFS.relation),
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

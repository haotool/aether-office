import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIFE_PREFS,
  migratePreferences,
  normalizeLife,
  PREFS_VERSION,
} from '../../apps/web/src/lib/preferences/prefs-migrate.js';

describe('the persisted preferences migration', () => {
  it('is at version 1, the one that added the Calm and relation settings', () => {
    expect(PREFS_VERSION).toBe(1);
  });

  it('keeps every stored key and adds `life` with the defaults when coming from version 0', () => {
    const stored = {
      locale: 'en',
      theme: 'light',
      reducedMotion: false,
      panelWidth: 480,
    };
    const out = migratePreferences(stored, 0);
    expect(out).toMatchObject(stored);
    expect(out['life']).toEqual(DEFAULT_LIFE_PREFS);
  });

  it('starts Calm mode on for a person who already asked for reduced motion', () => {
    const out = migratePreferences({ reducedMotion: true }, 0);
    expect((out['life'] as { calm: boolean }).calm).toBe(true);
  });

  it('leaves current-version preferences as they are, and survives nonsense', () => {
    const stored = { life: { ...DEFAULT_LIFE_PREFS, calm: true } };
    expect(migratePreferences(stored, 1)).toBe(stored);
    expect(migratePreferences(null, 0)['life']).toEqual(DEFAULT_LIFE_PREFS);
    expect(migratePreferences('x', 0)['life']).toEqual(DEFAULT_LIFE_PREFS);
  });

  it('repairs a stored `life` that is partial or of the wrong kind, dropping the keys that no longer exist', () => {
    expect(
      normalizeLife(
        { calm: 'yes', relation: false, frequency: 'rare', categories: { git: false } },
        true,
      ),
    ).toEqual({ calm: true, relation: false });
    expect(normalizeLife(undefined, false)).toEqual(DEFAULT_LIFE_PREFS);
  });
});

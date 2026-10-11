import { describe, expect, it } from 'vitest';
import {
  migratePreferences,
  normalizeLife,
  PREFS_VERSION,
} from '../../apps/web/src/lib/preferences/prefs-migrate.js';
import {
  DEFAULT_LIFE_PREFS,
  LIFE_CATEGORIES,
} from '../../packages/office-scene/src/life/signals.js';
import {
  announce,
  drain,
  emptyLogQueue,
  LOG_GAP_MS,
  nextDrainIn,
} from '../../packages/office-scene/src/life/aria-log.js';

describe('the persisted preferences migration', () => {
  it('is at version 1, the one that added the office-life settings', () => {
    expect(PREFS_VERSION).toBe(1);
  });

  it('keeps every stored key and adds `life` with the defaults when coming from version 0', () => {
    const stored = {
      locale: 'en',
      theme: 'light',
      intro: 'never',
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

  it('repairs a stored `life` that is partial or of the wrong kind, keeping what is valid', () => {
    const repaired = normalizeLife(
      { calm: 'yes', frequency: 'often', categories: { git: false, meme: 'no', nope: true } },
      true,
    );
    expect(repaired.calm).toBe(true);
    expect(repaired.frequency).toBe('rare');
    expect(repaired.categories.git).toBe(false);
    expect(repaired.categories.meme).toBe(true);
    expect(Object.keys(repaired.categories).sort()).toEqual([...LIFE_CATEGORIES].sort());
    expect(normalizeLife(undefined, false)).toEqual(DEFAULT_LIFE_PREFS);
  });
});

describe('the aria log queue', () => {
  it('announces the first line at once and holds the next until 5 s have passed', () => {
    let log = announce(announce(emptyLogQueue, 'one'), 'two');
    const first = drain(log, 1000);
    expect(first.line).toBe('one');
    log = first.log;
    expect(drain(log, 1000 + LOG_GAP_MS - 1).line).toBeNull();
    expect(nextDrainIn(log, 1000 + 1000)).toBe(LOG_GAP_MS - 1000);
    const second = drain(log, 1000 + LOG_GAP_MS);
    expect(second.line).toBe('two');
    expect(nextDrainIn(second.log, 9999)).toBeNull();
  });

  it('announces nothing when nothing waits', () => {
    expect(drain(emptyLogQueue, 5).line).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';
import { resolveTheme } from '../../apps/web/src/lib/preferences/theme.js';
import { ENTRIES, entryOf } from '../../apps/web/src/features/settings/entries.js';
import { highlight, searchSettings } from '../../apps/web/src/features/settings/search.js';
import {
  SECTIONS,
  sectionFromLocation,
  settingsPath,
} from '../../apps/web/src/features/settings/sections.js';

const found = (query: string) => [...(searchSettings(query) ?? [])];

describe('settings addresses', () => {
  it('reads the section from the path, then from the hash, and an unknown name is the home', () => {
    expect(sectionFromLocation('/settings/models', '')).toBe('models');
    expect(sectionFromLocation('/settings', '#about')).toBe('about');
    expect(sectionFromLocation('/settings/data', '#about')).toBe('data');
    expect(sectionFromLocation('/settings/models/', '')).toBe('models');
    expect(sectionFromLocation('/settings/nope', '')).toBeNull();
    expect(sectionFromLocation('/settings', '')).toBeNull();
    expect(sectionFromLocation('/office/models', '#general')).toBe('general');
  });

  it('builds the address of a section and keeps the open project', () => {
    expect(settingsPath('models', 'p1')).toBe('/settings/models?project=p1');
    expect(settingsPath(null, 'p1')).toBe('/settings?project=p1');
    expect(settingsPath('about', undefined)).toBe('/settings/about');
  });
});

describe('settings index', () => {
  it('has unique ids, a real group for each and words in both languages', () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    const groups = new Set<string>(SECTIONS.map((s) => s.id));
    for (const entry of ENTRIES) {
      expect(groups.has(entry.section), entry.id).toBe(true);
      for (const key of [entry.label, entry.desc]) {
        expect(zh[key]?.trim(), `zh ${key}`).toBeTruthy();
        expect(en[key]?.trim(), `en ${key}`).toBeTruthy();
      }
    }
    for (const section of SECTIONS)
      expect(
        ENTRIES.some((e) => e.section === section.id),
        section.id,
      ).toBe(true);
  });
});

describe('settings search', () => {
  it('finds a setting by its name in either language, whatever the interface language is', () => {
    expect(found('語言')).toContain('language');
    expect(found('language')).toContain('language');
    expect(found('LANGUAGE')).toContain('language');
    expect(found('外觀')).toContain('theme');
    expect(found('theme')).toContain('theme');
    expect(found('主題')).toContain('theme');
  });

  it('needs every word, finds by description, and by the name of a group', () => {
    expect(found('theme dark')).toContain('theme');
    expect(found('theme zzzz')).toEqual([]);
    expect(found('AETHER_LOCAL_SESSIONS')).toContain('local');
    expect(found('通知')).toEqual(expect.arrayContaining(['notify', 'remote']));
    expect(found('notifications')).toEqual(expect.arrayContaining(['notify', 'remote']));
  });

  it('has nothing to look for with an empty query and finds nothing for nonsense', () => {
    expect(searchSettings('')).toBeNull();
    expect(searchSettings('   ')).toBeNull();
    expect(found('qqqqqq')).toEqual([]);
  });

  it('entryOf returns a known row and throws for an unknown id', () => {
    expect(entryOf(ENTRIES[0].id).id).toBe(ENTRIES[0].id);
    expect(() => entryOf('not-a-settings-entry' as (typeof ENTRIES)[number]['id'])).toThrow(
      /unknown settings entry/,
    );
  });
});

describe('search highlight', () => {
  it('splits the text into matching and plain runs, case-insensitively and across languages', () => {
    expect(highlight('Reduce motion', 'MOT')).toEqual([
      { text: 'Reduce ', hit: false },
      { text: 'mot', hit: true },
      { text: 'ion', hit: false },
    ]);
    expect(highlight('減少動態效果', '動態')).toEqual([
      { text: '減少', hit: false },
      { text: '動態', hit: true },
      { text: '效果', hit: false },
    ]);
    expect(highlight('Language', '')).toEqual([{ text: 'Language', hit: false }]);
    expect(highlight('Language', 'zzz')).toEqual([{ text: 'Language', hit: false }]);
  });

  it('merges overlapping words into one run', () => {
    expect(highlight('notifications', 'notif tific')).toEqual([
      { text: 'notific', hit: true },
      { text: 'ations', hit: false },
    ]);
  });
});

describe('theme', () => {
  it('keeps the two stored values and follows the system only when asked to', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('reads a value it does not know as dark', () => {
    expect(resolveTheme('solarized', false)).toBe('dark');
  });
});

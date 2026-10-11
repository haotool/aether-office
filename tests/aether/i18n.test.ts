import { describe, expect, it } from 'vitest';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';

const CJK = /[㐀-鿿豈-﫿]/;
const PLACEHOLDER = /\b(TODO|FIXME|lorem|ipsum|placeholder|xxx|tbd)\b|待補|佔位/i;

describe('language switch', () => {
  it('has exactly the same keys in Traditional Chinese and English, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const [key, value] of Object.entries({ ...zh }))
      expect(value.trim(), `zh ${key}`).not.toBe('');
    for (const [key, value] of Object.entries(en)) expect(value.trim(), `en ${key}`).not.toBe('');
  });

  it('keeps each language in its own script: no Chinese left in English, and no untranslated English sentences in Chinese', () => {
    const chineseInEnglish = Object.entries(en)
      .filter(([, v]) => CJK.test(v))
      .map(([k]) => k);
    expect(chineseInEnglish).toEqual([]);
    const untranslated = Object.entries(zh)
      .filter(
        ([, v]) =>
          !CJK.test(v) &&
          /[A-Za-z]{4,}\s+[A-Za-z]{3,}/.test(v) &&
          !/^[A-Za-z0-9 ./:·\-+_()]+$/.test(v.replace(/\s/g, '')),
      )
      .map(([k]) => k);
    expect(untranslated).toEqual([]);
  });

  it('contains no placeholder copy in either language', () => {
    const found = [...Object.entries(zh), ...Object.entries(en)]
      .filter(([, v]) => PLACEHOLDER.test(v))
      .map(([k]) => k);
    expect(found).toEqual([]);
  });
});

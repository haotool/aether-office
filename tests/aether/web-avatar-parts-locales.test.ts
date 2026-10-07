import { describe, expect, it } from 'vitest';
import { EYE_STYLES, INK, MOUTH_STYLES, eyes, mouth } from '../../apps/web/src/avatar/face.js';
import { GEAR } from '../../apps/web/src/avatar/gear.js';
import { settingsEn } from '../../apps/web/src/locales/settings-en.js';
import { settingsZh } from '../../apps/web/src/locales/settings-zh.js';
import { squadEn } from '../../apps/web/src/locales/squad-en.js';
import { squadZh } from '../../apps/web/src/locales/squad-zh.js';

const PLACEHOLDER = /\{\w+\}/g;
const placeholders = (text: string) => (text.match(PLACEHOLDER) ?? []).sort();

describe('avatar faces', () => {
  it('draws every eye and mouth style as markup of its own', () => {
    const states = ['alert', 'closed', 'cross'] as const;
    const drawn = [...EYE_STYLES, ...states].map((style) => eyes(style));
    expect(new Set(drawn).size).toBe(drawn.length);
    const mouths = MOUTH_STYLES.map((style) => mouth(style));
    expect(new Set(mouths).size).toBe(mouths.length);
    for (const markup of [...drawn, ...mouths])
      expect(markup).toMatch(/^<(path|circle|ellipse|g|rect)\b/);
  });

  it('places two eyes on the face, in the ink colour', () => {
    expect(eyes('round')).toContain('cx="24"');
    expect(eyes('round')).toContain('cx="40"');
    expect(eyes('round')).toContain(INK);
  });

  it('draws a pure function of the style', () => {
    expect(eyes('wink')).toBe(eyes('wink'));
    expect(mouth('tongue')).toBe(mouth('tongue'));
  });
});

describe('avatar gear', () => {
  it('has unique ids, a positive chance each, and draws as markup that depends only on the colour', () => {
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(GEAR.length);
    for (const gear of GEAR) {
      expect(gear.weight, gear.id).toBeGreaterThan(0);
      expect(gear.draw('#abcdef'), gear.id).toMatch(/^<\w+/);
      expect(gear.draw('#abcdef')).toBe(gear.draw('#abcdef'));
    }
  });

  it('takes the identity’s colour for most pieces', () => {
    const colored = GEAR.filter((g) => g.draw('#abcdef').includes('#abcdef'));
    expect(colored.length).toBeGreaterThan(GEAR.length / 2);
  });

  it('offers only the slots a face has, with something in each', () => {
    const slots = new Set(GEAR.map((g) => g.slot));
    expect([...slots].every((s) => ['head', 'eyes', 'audio', 'neck', 'face'].includes(s))).toBe(
      true,
    );
    expect(slots.size).toBeGreaterThanOrEqual(3);
  });

  it('keeps headphones away from hats', () => {
    const audio = GEAR.filter((g) => g.slot === 'audio');
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.some((g) => g.clashesWithHead)).toBe(true);
  });
});

describe('locale tables', () => {
  it.each([
    ['settings', settingsEn, settingsZh],
    ['squad', squadEn, squadZh],
  ])('speak the same %s keys in both languages, none empty', (_name, en, zh) => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect((en[key] as string).trim(), `en ${String(key)}`).not.toBe('');
      expect((zh[key] as string).trim(), `zh ${String(key)}`).not.toBe('');
    }
  });

  it.each([
    ['settings', settingsEn, settingsZh],
    ['squad', squadEn, squadZh],
  ])('fill the same {placeholders} in both %s languages', (_name, en, zh) => {
    for (const key of Object.keys(en) as (keyof typeof en)[])
      expect(placeholders(zh[key] as string), String(key)).toEqual(placeholders(en[key] as string));
  });

  it('translate: the Chinese table is not a copy of the English one', () => {
    const same = Object.keys(squadEn).filter(
      (key) =>
        (squadEn as Record<string, string>)[key] === (squadZh as Record<string, string>)[key],
    );
    expect(same.length).toBeLessThan(Object.keys(squadEn).length / 4);
  });
});

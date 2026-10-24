import { describe, expect, it } from 'vitest';
import { EN } from '../../packages/office-scene/src/i18n/en.js';
import { ZH } from '../../packages/office-scene/src/i18n/zh.js';
import { intlLocale, sceneT, sceneText } from '../../packages/office-scene/src/i18n/scene-text.js';

const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the scene words', () => {
  it('say every key in both languages, with the same values to fill in', () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(EN).sort());
    for (const key of Object.keys(EN) as (keyof typeof EN)[])
      expect(slots(ZH[key]), key).toEqual(slots(EN[key]));
  });

  it('fill each value in, keep a word that has none, and leave a missing value empty', () => {
    expect(sceneText(false, 'pip.switchTo', { name: 'Ada' })).toBe('Switch to Ada');
    expect(sceneText(true, 'pip.switchTo', { name: 'Ada' })).toBe('切換到 Ada');
    expect(sceneText(false, 'hud.auto')).toBe('AUTO');
    expect(sceneText(true, 'tip.tier', {})).toBe('第  層');
  });

  it('put a value in as written, even one that looks like a pattern', () => {
    expect(sceneText(false, 'handover.received', { type: '$& {type}' })).toBe(
      '$& {type} handed over its result',
    );
  });

  it('are one language per translator, and name the Intl locale of each', () => {
    expect(sceneT(true)('hud.keys')).toBe('操作');
    expect(sceneT(false)('hud.keys')).toBe('KEYS');
    expect([intlLocale(true), intlLocale(false)]).toEqual(['zh-TW', 'en']);
  });
});

import { describe, expect, it } from 'vitest';
import { DITHERED, DITHER_END, DITHER_PARS } from '../../packages/office-scene/src/dither.js';
import {
  captionKeyOf,
  introCaption,
  introWords,
} from '../../packages/office-scene/src/intro/intro-text.js';

describe('intro captions', () => {
  it('welcomes during the orbit and the first move, names the history on the rise, and counts it at the top', () => {
    expect(captionKeyOf('orbit')).toBe('welcome');
    expect(captionKeyOf('toExploded')).toBe('welcome');
    expect(captionKeyOf('rise')).toBe('history');
    for (const phase of ['hold', 'toStacked'] as const) expect(captionKeyOf(phase)).toBe('crown');
  });

  it('counts the real commits and tiers at the crown, in both languages', () => {
    const facts = { commits: 1234, tiers: 5 };
    expect(introCaption('crown', facts, false)).toBe('1234 commits · 5 tiers');
    expect(introCaption('crown', facts, true)).toBe('1234 個提交 · 5 層');
  });

  it('claims nothing about a repository when there is none', () => {
    const none = { commits: 0, tiers: 0 };
    expect(introCaption('history', none, false)).toBe('The office, deck by deck');
    expect(introCaption('crown', none, false)).toBe('Five decks, one building');
    expect(introCaption('history', { commits: 10, tiers: 2 }, false)).toContain(
      'history grows here',
    );
    for (const key of ['welcome', 'history', 'crown'] as const)
      expect(introCaption(key, none, true)).not.toMatch(/commits|tiers/);
  });

  it('has a different line in each language for every caption', () => {
    for (const key of ['welcome', 'history', 'crown'] as const)
      for (const facts of [
        { commits: 3, tiers: 2 },
        { commits: 0, tiers: 0 },
      ])
        expect(introCaption(key, facts, true)).not.toBe(introCaption(key, facts, false));
  });

  it('words the buttons and labels of the tour the same way in both languages', () => {
    const en = introWords(false);
    const zh = introWords(true);
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(zh[key]).not.toBe(en[key]);
    }
  });
});

describe('dither shader pieces', () => {
  it('include the hash before main and the premultiply and noise last, in that order', () => {
    expect(DITHER_PARS).toContain('dithering_pars_fragment');
    expect(DITHER_END.indexOf('premultiplied_alpha_fragment')).toBeLessThan(
      DITHER_END.indexOf('dithering_fragment'),
    );
  });

  it('switches both material options on together, since the noise only helps premultiplied', () => {
    expect(DITHERED).toEqual({ premultipliedAlpha: true, dithering: true });
  });
});

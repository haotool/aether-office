import { describe, expect, it } from 'vitest';
import {
  introForced,
  phoneRemembersIntro,
  shouldAutoplayIntro,
} from '../../apps/web/src/lib/navigation/intro-gate.js';

const first = { pref: 'auto', playedThisSession: false, automated: false, force: false } as const;

describe('shouldAutoplayIntro', () => {
  it('plays on a first visit of the session with the preference on', () => {
    expect(shouldAutoplayIntro(first)).toBe(true);
  });
  it('stays away once played this session, with "never", or under automation', () => {
    expect(shouldAutoplayIntro({ ...first, playedThisSession: true })).toBe(false);
    expect(shouldAutoplayIntro({ ...first, pref: 'never' })).toBe(false);
    expect(shouldAutoplayIntro({ ...first, automated: true })).toBe(false);
  });
  it('?intro=force plays whatever the rest says', () => {
    expect(
      shouldAutoplayIntro({ pref: 'never', playedThisSession: true, automated: true, force: true }),
    ).toBe(true);
  });
});

describe('introForced and phones', () => {
  it('reads only the exact override', () => {
    expect(introForced('?intro=force')).toBe(true);
    expect(introForced('?perf=1&intro=force')).toBe(true);
    expect(introForced('?intro=1')).toBe(false);
    expect(introForced('')).toBe(false);
  });
  it('a phone remembers it has seen the tour, unless forced', () => {
    expect(phoneRemembersIntro(true, false)).toBe(true);
    expect(phoneRemembersIntro(true, true)).toBe(false);
    expect(phoneRemembersIntro(false, false)).toBe(false);
  });
});

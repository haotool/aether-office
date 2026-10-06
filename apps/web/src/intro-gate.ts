// The page's side of the first-visit camera tour: whether it may start by itself, and what is remembered afterwards.
// The tour itself (path, state machine, caption) lives in packages/office-scene/src/intro.

const PLAYED_KEY = 'aether.intro.played';

export type IntroGateInput = {
  /** The persisted preference: `auto` or "don't show again". */
  pref: 'auto' | 'never';
  /** The tour already ran in this browser session. */
  playedThisSession: boolean;
  /** The browser is driven by automation (a test, a crawler): a camera that moves on its own is never wanted there. */
  automated: boolean;
  /** `?intro=force`: the test override that plays it regardless of the rest. */
  force: boolean;
};

/** May the tour start by itself? Replay does not ask. */
export const shouldAutoplayIntro = ({
  pref,
  playedThisSession,
  automated,
  force,
}: IntroGateInput) => force || (pref === 'auto' && !playedThisSession && !automated);

export const introForced = (search: string) => new URLSearchParams(search).get('intro') === 'force';

/** On a phone the tour plays once, ever: finishing or leaving it turns the preference off (Replay stays in the controls). */
export const phoneRemembersIntro = (compact: boolean, force: boolean) => compact && !force;

export function introPlayedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(PLAYED_KEY) !== null;
  } catch {
    return false; // storage blocked: the tour may repeat, which is the harmless side to err on
  }
}

export function markIntroPlayed(): void {
  try {
    window.sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    /* storage blocked: the page just forgets it */
  }
}

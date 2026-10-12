const PLAYED_KEY = 'aether.intro.played';

type IntroGateInput = {
  pref: 'auto' | 'never';
  playedThisSession: boolean;
  /** The browser is driven by automation (a test, a crawler): a camera that moves on its own is never wanted there. */
  automated: boolean;
  force: boolean;
};

export const shouldAutoplayIntro = ({
  pref,
  playedThisSession,
  automated,
  force,
}: IntroGateInput) => force || (pref === 'auto' && !playedThisSession && !automated);

export const introForced = (search: string) => new URLSearchParams(search).get('intro') === 'force';

export const phoneRemembersIntro = (compact: boolean, force: boolean) => compact && !force;

let replayAsked = false;
export const requestIntroReplay = () => {
  replayAsked = true;
};
export const introReplayRequested = () => replayAsked;
export const clearIntroReplayRequest = () => {
  replayAsked = false;
};

export function introPlayedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(PLAYED_KEY) !== null;
  } catch {
    return false;
  }
}

export function markIntroPlayed(): void {
  try {
    window.sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    /* storage blocked: the page just forgets it */
  }
}

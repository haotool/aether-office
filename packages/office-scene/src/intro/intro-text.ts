import type { IntroPhase } from './intro-tour.js';

export type IntroCaptionKey = 'welcome' | 'history' | 'crown';

/** Which caption a phase shows: the orbit welcomes, the rise names the history, the hold counts it. */
export const captionKeyOf = (phase: IntroPhase): IntroCaptionKey =>
  phase === 'orbit' || phase === 'toExploded' ? 'welcome' : phase === 'rise' ? 'history' : 'crown';

/** The words on screen (and read out once each by the live region). With no repository the crown has nothing to count. */
export function introCaption(
  key: IntroCaptionKey,
  facts: { commits: number; tiers: number },
  zh: boolean,
): string {
  const repo = facts.tiers > 0;
  switch (key) {
    case 'welcome':
      return zh ? '歡迎來到辦公室' : 'Welcome to the office';
    case 'history':
      return repo
        ? zh
          ? '你的儲存庫歷史在這裡生長'
          : "Your repository's history grows here"
        : zh
          ? '一層一層看整座辦公室'
          : 'The office, deck by deck';
    case 'crown':
      return repo
        ? zh
          ? `${facts.commits} 個提交 · ${facts.tiers} 層`
          : `${facts.commits} commits · ${facts.tiers} tiers`
        : zh
          ? '五層樓，一棟建築'
          : 'Five decks, one building';
  }
}

export const introWords = (zh: boolean) =>
  zh
    ? {
        skip: '略過',
        never: '不再顯示',
        hint: '按任意鍵或點一下即可略過',
        label: '開場導覽',
        replay: '重播開場導覽',
      }
    : {
        skip: 'Skip',
        never: "Don't show again",
        hint: 'Press any key or tap to skip',
        label: 'Intro tour',
        replay: 'Replay intro',
      };

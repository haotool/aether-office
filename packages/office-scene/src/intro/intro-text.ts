import type { IntroPhase } from './intro-tour.js';
import { sceneT } from '../i18n/scene-text.js';

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
  const t = sceneT(zh);
  switch (key) {
    case 'welcome':
      return t('intro.welcome');
    case 'history':
      return t(repo ? 'intro.historyRepo' : 'intro.historyNone');
    case 'crown':
      return repo
        ? t('intro.crownRepo', { commits: facts.commits, tiers: facts.tiers })
        : t('intro.crownNone');
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

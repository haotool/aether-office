import type { Agent } from '@aether/contracts';
import type { EyeStyle, MouthStyle } from './face.js';

/** What the person looking at the portrait should read at a glance. `idle` is the base, unchanged. */
export type AvatarState = 'idle' | 'working' | 'needs' | 'sleeping' | 'error' | 'finished';

export function avatarState(activity: Agent['activity'] | undefined): AvatarState {
  switch (activity) {
    case 'working':
    case 'reviewing':
    case 'starting':
      return 'working';
    case 'waiting_permission':
    case 'waiting_peer':
      return 'needs';
    case 'offline':
      return 'sleeping';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

interface StateLook {
  eyes?: EyeStyle;
  mouth?: MouthStyle;
  /** Drawn over everything; `fg` reads on the portrait's backdrop. */
  overlay: string;
}

const badge = (fill: string, mark: string) =>
  `<circle cx="53" cy="11" r="7.5" fill="${fill}" stroke="#fff" stroke-width="1.2"/>${mark}`;

/** A state swaps the eyes and mouth and adds a mark; the species, colors, markings and accessories never change. */
export function stateLook(state: AvatarState, fg: string): StateLook {
  switch (state) {
    case 'working':
      return {
        eyes: 'focused',
        overlay: `<path d="M51 17 q3.4 4.6 0 7.2 q-3.4 -2.6 0 -7.2z" fill="#6CC7E8"/>`,
      };
    case 'needs':
      return {
        eyes: 'alert',
        overlay: badge(
          '#E2493A',
          '<path d="M53 7 V12" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="53" cy="15" r="1.2" fill="#fff"/>',
        ),
      };
    case 'sleeping':
      return {
        eyes: 'closed',
        mouth: 'neutral',
        overlay: `<path d="M46 9 h6 l-6 6.5 h6 M54 3 h4 l-4 4.4 h4" fill="none" stroke="${fg}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      };
    case 'error':
      return { eyes: 'cross', mouth: 'neutral', overlay: '' };
    case 'finished':
      return {
        mouth: 'smile',
        overlay: badge(
          '#46B58A',
          '<path d="M49.6 11.2 l2.4 2.6 l4.4 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ),
      };
    case 'idle':
      return { overlay: '' };
  }
}

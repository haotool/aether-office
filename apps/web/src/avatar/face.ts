/** Eyes and mouths on the 64 x 64 portrait. Pure string builders; the face is the only part a state may swap. */
export const INK = '#16181D';
const TONGUE = '#E8788A';

export const EYE_STYLES = [
  'round',
  'sleepy',
  'sparkle',
  'wink',
  'focused',
  'star',
  'tired',
  'determined',
] as const;
/** The styles a state puts on top of the identity's own. */
type StateEyes = 'alert' | 'closed' | 'cross';
export type EyeStyle = (typeof EYE_STYLES)[number] | StateEyes;

export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'tongue', 'surprised', 'smirk'] as const;
export type MouthStyle = (typeof MOUTH_STYLES)[number];

const EYE_X = [24, 40] as const;
const EYE_Y = 34;

const stroke = (d: string, w = 1.6, color = INK) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (x: number, y: number, r: number, fill = INK) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

const STAR =
  'M0 -3.8 L1.1 -1.2 L3.8 -1.1 L1.7 0.6 L2.4 3.3 L0 1.8 L-2.4 3.3 L-1.7 0.6 L-3.8 -1.1 L-1.1 -1.2Z';

function eye(style: EyeStyle, x: number, side: -1 | 1): string {
  const y = EYE_Y;
  switch (style) {
    case 'round':
      return dot(x, y, 3) + dot(x + 1, y - 1, 0.9, '#fff');
    case 'sleepy':
      return `<path d="M${x - 3.2} ${y} h6.4 a3.2 3.2 0 0 1 -6.4 0z" fill="${INK}"/>`;
    case 'sparkle':
      return (
        dot(x, y, 3.5) + dot(x - 1.1, y - 1.3, 1.4, '#fff') + dot(x + 1.2, y + 1.2, 0.8, '#fff')
      );
    case 'wink':
      return side === 1
        ? stroke(`M${x - 3} ${y + 1} Q${x} ${y - 2.4} ${x + 3} ${y + 1}`)
        : dot(x, y, 3) + dot(x + 1, y - 1, 0.9, '#fff');
    case 'focused':
      return (
        `<ellipse cx="${x}" cy="${y + 0.6}" rx="3" ry="2.1" fill="${INK}"/>` +
        stroke(`M${x - 4} ${y - 2.6} H${x + 4}`)
      );
    case 'star':
      return `<path d="${STAR}" transform="translate(${x} ${y})" fill="${INK}"/>`;
    case 'tired':
      return dot(x, y, 2.6) + stroke(`M${x - 3} ${y + 4.6} q3 1.8 6 0`, 1.1);
    case 'determined':
      return (
        dot(x, y + 0.6, 2.8) +
        stroke(`M${x - 4 * side} ${y - 5.2} L${x + 3.6 * side} ${y - 3.2}`, 1.8)
      );
    case 'alert':
      return `<circle cx="${x}" cy="${y}" r="4.2" fill="#fff"/>` + dot(x, y, 2.4);
    case 'closed':
      return stroke(`M${x - 3} ${y} Q${x} ${y + 3} ${x + 3} ${y}`);
    case 'cross':
      return stroke(
        `M${x - 2.6} ${y - 2.6} L${x + 2.6} ${y + 2.6} M${x + 2.6} ${y - 2.6} L${x - 2.6} ${y + 2.6}`,
        1.7,
      );
  }
}

export function eyes(style: EyeStyle): string {
  return eye(style, EYE_X[0], -1) + eye(style, EYE_X[1], 1);
}

export function mouth(style: MouthStyle): string {
  switch (style) {
    case 'smile':
      return stroke('M27.5 45 Q32 49.5 36.5 45', 1.5);
    case 'grin':
      return `<path d="M27 44.5 Q32 53 37 44.5Z" fill="${INK}"/>`;
    case 'neutral':
      return stroke('M29 47 H35', 1.5);
    case 'tongue':
      return (
        `<path d="M29.5 46.6 q2.5 5.4 5 0z" fill="${TONGUE}"/>` +
        stroke('M27.5 45 Q32 49.5 36.5 45', 1.5)
      );
    case 'surprised':
      return `<ellipse cx="32" cy="47.4" rx="2.2" ry="2.8" fill="${INK}"/>`;
    case 'smirk':
      return stroke('M28 47 Q32.5 48 36.5 44.6', 1.5);
  }
}

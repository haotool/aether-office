type Slot = 'head' | 'eyes' | 'audio' | 'neck' | 'face';

export interface Gear {
  readonly id: string;
  readonly slot: Slot;
  readonly weight: number;
  readonly clashesWithHead?: boolean;
  /** Ears that stand straight up would poke through it. */
  readonly noTallEars?: boolean;
  readonly draw: (c: string) => string;
}

const GOLD = '#F2D16B';
const LEAF = '#5DBB63';
const line = (d: string, c: string, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const wing = (d: string, c: string) => `<path d="${d}" fill="${c}"/>`;

export const GEAR: readonly Gear[] = [
  {
    id: 'glasses',
    slot: 'eyes',
    weight: 3,
    draw: (c) =>
      `<circle cx="24" cy="34" r="5.4" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="40" cy="34" r="5.4" fill="none" stroke="${c}" stroke-width="1.6"/>` +
      line('M29.4 34 H34.6', c),
  },
  {
    id: 'shades',
    slot: 'eyes',
    weight: 2,
    draw: (c) =>
      wing(
        'M18.5 30.5 H29.5 V35 Q29.5 38.5 24 38.5 Q18.5 38.5 18.5 35Z M34.5 30.5 H45.5 V35 Q45.5 38.5 40 38.5 Q34.5 38.5 34.5 35Z',
        '#14161A',
      ) +
      line('M29.5 31.5 H34.5', '#14161A', 1.4) +
      line('M20.5 32.6 L23 32.6', c, 1.2) +
      line('M36.5 32.6 L39 32.6', c, 1.2),
  },
  {
    id: 'monocle',
    slot: 'eyes',
    weight: 1,
    draw: () =>
      `<circle cx="40" cy="34" r="5.8" fill="none" stroke="${GOLD}" stroke-width="1.5"/>` +
      line('M44 38.4 Q48 47 46 55', GOLD, 1),
  },
  {
    id: 'visor',
    slot: 'eyes',
    weight: 2,
    draw: (c) =>
      `<rect x="16.5" y="30" width="31" height="8" rx="4" fill="${c}" fill-opacity=".5" stroke="${c}" stroke-width="1.2"/>` +
      line('M20 32.4 H25', '#fff', 1),
  },
  {
    id: 'headset',
    slot: 'audio',
    weight: 2,
    draw: (c) =>
      `<circle cx="11.5" cy="37" r="4.2" fill="${c}"/>` +
      line('M11.5 41 Q12.5 51 25 51.5', c, 1.4) +
      `<circle cx="26" cy="51.5" r="1.9" fill="${c}"/>`,
  },
  {
    id: 'headphones',
    slot: 'audio',
    weight: 2,
    clashesWithHead: true,
    draw: (c) =>
      line('M11 36 Q11 10 32 10 Q53 10 53 36', c, 2.2) +
      `<rect x="7.5" y="31" width="7" height="12" rx="3.4" fill="${c}"/><rect x="49.5" y="31" width="7" height="12" rx="3.4" fill="${c}"/>`,
  },
  {
    id: 'beanie',
    slot: 'head',
    weight: 2,
    noTallEars: true,
    draw: (c) =>
      wing('M13.5 25 Q14 5.5 32 5.5 Q50 5.5 50.5 25Z', c) +
      `<rect x="12" y="21.5" width="40" height="6" rx="3" fill="#000" fill-opacity=".22"/>` +
      `<circle cx="32" cy="5" r="3.4" fill="#fff" fill-opacity=".9"/>`,
  },
  {
    id: 'cap',
    slot: 'head',
    weight: 2,
    noTallEars: true,
    draw: (c) =>
      wing('M14.5 25 Q15 8.5 32 8.5 Q49 8.5 49.5 25Z', c) +
      `<path d="M31 22.5 H54.5 Q57 22.5 56 25.8 H31Z" fill="${c}"/><path d="M31 25 H56" stroke="#000" stroke-opacity=".25" stroke-width="1.2"/>` +
      `<circle cx="32" cy="9" r="1.5" fill="#fff" fill-opacity=".9"/>`,
  },
  {
    id: 'halo',
    slot: 'head',
    weight: 1,
    draw: () =>
      `<ellipse cx="32" cy="9" rx="10" ry="2.8" fill="none" stroke="${GOLD}" stroke-width="2"/>`,
  },
  {
    id: 'leaf',
    slot: 'head',
    weight: 1,
    draw: () =>
      wing('M32 19.5 Q28 8 41 5 Q42.5 15.5 32 19.5Z', LEAF) +
      `<path d="M32 19.5 Q35 13 38.5 9" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`,
  },
  {
    id: 'flower',
    slot: 'head',
    weight: 1,
    draw: (c) =>
      [0, 72, 144, 216, 288]
        .map(
          (a) =>
            `<circle cx="${(47 + 3.2 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(16 + 3.2 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="2.7" fill="${c}"/>`,
        )
        .join('') + `<circle cx="47" cy="16" r="1.9" fill="${GOLD}"/>`,
  },
  {
    id: 'antenna',
    slot: 'head',
    weight: 1,
    draw: (c) => line('M32 19.5 V8', c, 1.6) + `<circle cx="32" cy="6.5" r="3" fill="${c}"/>`,
  },
  {
    id: 'circuit',
    slot: 'head',
    weight: 1,
    draw: (c) =>
      wing('M12.5 26 Q32 18.5 51.5 26 V30 Q32 22.5 12.5 30Z', '#20262D') +
      line('M19 27.4 H24 L26 25.4 H31', c, 1) +
      line('M45 27.4 H40 L38 25.4 H35', c, 1) +
      `<circle cx="32" cy="24.4" r="1.2" fill="${c}"/>`,
  },
  {
    id: 'bowtie',
    slot: 'neck',
    weight: 2,
    draw: (c) =>
      wing('M32 58 L23.5 53.6 V62.4Z M32 58 L40.5 53.6 V62.4Z', c) +
      `<circle cx="32" cy="58" r="2.2" fill="#000" fill-opacity=".3"/>`,
  },
  {
    id: 'scarf',
    slot: 'neck',
    weight: 2,
    draw: (c) =>
      wing('M13.5 54 Q32 62 50.5 54 V59.5 Q32 67.5 13.5 59.5Z', c) +
      wing('M39 60.5 H45 V70 H39Z', c) +
      `<path d="M39 64.5 H45" stroke="#000" stroke-opacity=".25" stroke-width="1.2"/>`,
  },
  {
    id: 'bandage',
    slot: 'face',
    weight: 1,
    draw: () =>
      `<g transform="rotate(-28 47 41.5)"><rect x="41.5" y="39" width="11" height="5.4" rx="2" fill="#F1D9B5"/><circle cx="45.2" cy="41.7" r=".6" fill="#B58B5A"/><circle cx="48.8" cy="41.7" r=".6" fill="#B58B5A"/></g>`,
  },
];

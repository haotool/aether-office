export const CELLS = [
  'duck',
  'glow',
  'bug',
  'hole',
  'rocket',
  'plane',
  'bell',
  'steam',
  'loop',
  'keyc',
  'keyv',
  'vim',
  'box',
  'confetti',
  'ring',
  'spark',
  'tick',
  'cross',
  'beetle',
  'squiggle',
  'hazard',
  'chevrons',
  'skull',
  'calendar',
  'stamp',
  'sticker',
  'bugsign',
  'featuresign',
  'root',
  'pipe',
  'swirl',
  'sticky',
] as const;
export type CellId = (typeof CELLS)[number];

export type Rgb = readonly [number, number, number];

/** One quad of an effect, in the desk's own frame (metres, y up, the member sits at +z). */
export type Sprite = {
  cell: CellId;
  at: readonly [number, number, number];
  size: number;
  alpha?: number;
  rot?: number;
  tint?: Rgb;
  flat?: boolean;
};

export type Effect = (t: number, duration: number, seed: number, value: number) => Sprite[];

export type PlacedSprite = {
  cell: CellId;
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  rot: number;
  flat: boolean;
  tint: Rgb;
};

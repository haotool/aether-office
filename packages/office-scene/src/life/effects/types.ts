/** The pictures of the shared sprite atlas, in cell order (pools/atlas-art.ts draws each one). */
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
  /** Edge length in metres. */
  size: number;
  alpha?: number;
  /** Turn in the quad's own plane, radians. */
  rot?: number;
  tint?: Rgb;
  /** Lies on the horizontal plane (a decal) instead of facing the camera. */
  flat?: boolean;
};

/**
 * An effect is a pure timeline: the sprites to draw `t` ms after it began, of an effect that lasts `duration` ms. The
 * same (t, duration, seed, value) always gives the same sprites, so a contact sheet frame and a test see what a viewer does.
 */
export type Effect = (t: number, duration: number, seed: number, value: number) => Sprite[];

/** A sprite placed in the world, ready to write into the pool. */
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

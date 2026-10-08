export type Vec3 = [number, number, number];

export type StalkCommit = {
  sha: string;
  parents: string[];
  refs: string[];
  subject: string;
  author: string;
  at: number;
};
export type StalkNode = {
  sha: string;
  subject: string;
  author: string;
  at: number;
  /** Branch names that point at this commit. */
  refs: string[];
  strand: number;
  merge: boolean;
  position: Vec3;
};
export type Strand = {
  name: string;
  color: string;
  radius: number;
  /** Where the strand starts and ends loose (no fork parent, no merge commit): the tube thins to a point there. */
  free: [boolean, boolean];
  /** Bottom to top, in order of height. */
  points: Vec3[];
};

export type TierShape = 'garden' | 'cluster' | 'halo' | 'prism' | 'terrace';
/** One floor of the crown, built from a run of consecutive commits. */
export type Tier = {
  index: number;
  shape: TierShape;
  /** Height of the tier's deck. */
  y: number;
  radius: number;
  /** The span of time its commits cover. */
  from: number;
  to: number;
  commits: number;
  merges: number;
  authors: number;
  branches: number;
  /** The strand that contributed most of its commits: its colour tints the tier. */
  strand: number;
  /** Seeds the tier's small variations (the first commit's hash), so the same history always looks the same. */
  seed: string;
};

export type Stalk = {
  /** Newest commit first, the order they came in. */
  nodes: StalkNode[];
  strands: Strand[];
  /** Bottom to top, one per COMMITS_PER_TIER commits of history. */
  tiers: Tier[];
  /** The top of the building and the height of the first tier's deck. */
  roof: number;
  /** The tip of the spire, where the braid ends. */
  top: number;
  /** 0 to 1: how much happened in the last two weeks. Drives the pulses and the glow. */
  energy: number;
};

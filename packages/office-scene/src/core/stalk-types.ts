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
  refs: string[];
  strand: number;
  merge: boolean;
  position: Vec3;
};
export type Strand = {
  name: string;
  color: string;
  radius: number;
  free: [boolean, boolean];
  points: Vec3[];
};

export type TierShape = 'garden' | 'cluster' | 'halo' | 'prism' | 'terrace';
export type Tier = {
  index: number;
  shape: TierShape;
  y: number;
  radius: number;
  from: number;
  to: number;
  commits: number;
  merges: number;
  authors: number;
  branches: number;
  strand: number;
  seed: string;
};

export type Stalk = {
  nodes: StalkNode[];
  strands: Strand[];
  tiers: Tier[];
  roof: number;
  top: number;
  energy: number;
};

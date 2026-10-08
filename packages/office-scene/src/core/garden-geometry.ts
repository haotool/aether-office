import * as THREE from 'three';
import { genomeOf, type Genome } from '../flowers/flower-genome.js';
import { addBloom, type Bloom } from '../flowers/flower-bloom.js';
import { GOLDEN_ANGLE } from '../flowers/flower-petals.js';
import { KIND, MeshBuilder, type Style } from '../flowers/flower-mesh.js';
import { growTwigs, twigShare } from '../flowers/flower-tree.js';
import { flowerColor, mergeStands } from './merge-flowers.js';
import { seeded } from '../environment/seeded.js';
import { paletteAt } from './stalk-layout.js';
import type { Stalk, Tier } from './stalk-types.js';
import { itemAt, lastOf } from '../environment/checked.js';

/** What a flower is, for the hover card. */
export type BloomInfo = {
  genome: Genome;
  /** The tier it grows on, or null for the great bloom on the spire. */
  tier: Tier | null;
  /** The commit that seeded it. */
  sha: string;
  /** What it stands for: the commits and the span of time of its tier, or of the whole history. */
  commits: number;
  from: number;
  to: number;
  /** Set for a merge commit's small flower: what the commit says. */
  merge?: { subject: string; strand: number };
};

type Garden = {
  /** Every petal, stem, twig, floret and ring of every flower: one mesh. */
  mesh: THREE.BufferGeometry;
  /** Orbiting pollen and drifting spores: one points object (null on low quality). */
  pollen: THREE.BufferGeometry | null;
  /** Indexed by the shader's flower index (a tier's index; the spire's is `tiers.length`, then one for each merge flower). */
  blooms: BloomInfo[];
  /** The same index: the height of the braid a merge flower waits for before it opens, null for a tier's or the spire's. */
  climb: (number | null)[];
  triangles: number;
  /** What the glass trees grew in all, for the budget. */
  twigs: { segments: number; buds: number };
};

/** The history at which the great bloom reaches its full size. */
const FULL_HISTORY = 150;
const STEM_SEGMENTS = 8;
/** How far from the axis (metres) a tier's stem leaves the braid. */
const BRAID_STAND = 1.2;
/** Metres above the braid's tip the great bloom opens, over the clouds. */
const GRAND_RISE = 6;
const up = new THREE.Vector3(0, 1, 0);
const bezier = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  t: number,
) => {
  const s = 1 - t;
  return a
    .clone()
    .multiplyScalar(s ** 3)
    .addScaledVector(b, 3 * s * s * t)
    .addScaledVector(c, 3 * s * t * t)
    .addScaledVector(d, t ** 3);
};

/** The tier's branch colour turned a little further round the colour wheel for each tier, so the crown is a spectrum, not one hue. */
const tierColor = (t: Tier) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(paletteAt(t.strand)).getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h + 0.09 * t.index) % 1, hsl.s, hsl.l);
};

/**
 * Where a tier's flower blooms: its stem leaves the braid at the tier's height and arcs outwards and upwards, the lower tiers
 * reaching further, so the flowers spread like a flowering tree that narrows towards the top. Each faces up and out.
 */
function tierBloom(tier: Tier): { bloom: Bloom; stem: THREE.Vector3[] } {
  const genome = genomeOf({
    seed: tier.seed,
    merges: tier.merges,
    authors: tier.authors,
    branches: tier.branches,
  });
  const random = seeded(`stand:${tier.seed}`);
  const size = Math.min(7, Math.max(2.6, tier.radius * 0.34)) * (0.85 + 0.3 * random());
  const psi = tier.index * GOLDEN_ANGLE + random() * 0.8;
  const out = new THREE.Vector3(Math.cos(psi), 0, Math.sin(psi));
  const base = out.clone().multiplyScalar(BRAID_STAND).setY(tier.y);
  const reach = tier.radius * 0.55;
  const height = 1.5 + size * 0.6;
  const axis = out
    .clone()
    .multiplyScalar(genome.lean * 1.4)
    .add(up)
    .normalize();
  const head = base.clone().addScaledVector(up, height).addScaledVector(out, reach);
  const c1 = base
    .clone()
    .addScaledVector(up, height * 1.1)
    .addScaledVector(out, reach * 0.15);
  const c2 = head.clone().addScaledVector(axis, -reach * 0.45);
  const stem = Array.from({ length: STEM_SEGMENTS + 1 }, (_, i) =>
    bezier(base, c1, c2, head, i / STEM_SEGMENTS),
  );
  return {
    bloom: {
      genome,
      flower: tier.index,
      origin: head,
      axis,
      size,
      base: flowerColor(tierColor(tier)),
    },
    stem,
  };
}

function stemOf(b: MeshBuilder, bloom: Bloom, stem: THREE.Vector3[]) {
  const style: Style = {
    hinge: itemAt(stem, 0),
    axis: up,
    swing: 0,
    order: 0,
    flower: bloom.flower,
    kind: KIND.tube,
    colorA: bloom.base,
    colorB: bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.4),
    detail: 1,
    glass: 0,
    sway: bloom.size * 0.1,
  };
  b.tube(stem, (t) => bloom.size * (bloom.grand ? 0.014 : 0.035) * (1 - 0.35 * t), 3, style);
}

/** Pollen orbiting each flower (mode 0) and spores drifting up past it (mode 1), as points the shader moves. */
function pollenOf(blooms: Bloom[]): THREE.BufferGeometry | null {
  const orbit: number[] = [];
  const centre: number[] = [];
  const axis: number[] = [];
  const meta: number[] = [];
  const color: number[] = [];
  for (const bloom of blooms) {
    const random = seeded(`pollen:${bloom.genome.code}`);
    const c = bloom.origin.clone().addScaledVector(bloom.axis, bloom.size * 0.55);
    for (let i = 0; i < bloom.genome.pollen; i++) {
      const drift = i % 3 === 2;
      orbit.push(
        bloom.size * (0.45 + 0.9 * random()),
        2 * Math.PI * random(),
        (0.25 + 0.4 * random()) * (random() < 0.5 ? -1 : 1),
        random(),
      );
      centre.push(c.x, c.y, c.z);
      axis.push(bloom.axis.x, bloom.axis.y, bloom.axis.z);
      meta.push(bloom.flower, drift ? 1 : 0, bloom.size * (0.035 + 0.03 * random()), bloom.size);
      const tint = bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.55);
      color.push(tint.r, tint.g, tint.b);
    }
  }
  if (!orbit.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(centre, 3));
  g.setAttribute('orbit', new THREE.Float32BufferAttribute(orbit, 4));
  g.setAttribute('axis', new THREE.Float32BufferAttribute(axis, 3));
  g.setAttribute('meta', new THREE.Float32BufferAttribute(meta, 4));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(color, 3));
  return g;
}

/** One flower per tier on its stem, with the twigs (shared out between the tiers that grow any). */
function tierFlowers(b: MeshBuilder, stalk: Stalk, low: boolean) {
  const stands = stalk.tiers.map(tierBloom);
  const share = twigShare(stands.filter((s) => s.bloom.genome.twigs > 0).length);
  const twigs = { segments: 0, buds: 0 };
  const blooms: Bloom[] = [];
  const infos: BloomInfo[] = [];
  for (const [index, tier] of stalk.tiers.entries()) {
    const { bloom, stem } = itemAt(stands, index);
    blooms.push(bloom);
    infos.push({
      genome: bloom.genome,
      tier,
      sha: tier.seed,
      commits: tier.commits,
      from: tier.from,
      to: tier.to,
    });
    stemOf(b, bloom, stem);
    addBloom(b, bloom, { low });
    const grown = growTwigs(b, bloom, stem, share, low);
    twigs.segments += grown.segments;
    twigs.buds += grown.buds;
  }
  return { blooms, infos, twigs };
}

/** The great bloom on the spire, seeded by every tier and as big as the history is long. */
function crownFlower(
  b: MeshBuilder,
  stalk: Stalk,
  low: boolean,
): { bloom: Bloom; info: BloomInfo } {
  const commits = stalk.tiers.reduce((sum, t) => sum + t.commits, 0);
  const last = lastOf(stalk.tiers);
  const genome = genomeOf({
    seed: `crown:${stalk.tiers.map((t) => t.seed).join('')}`,
    merges: last.merges,
    authors: last.authors,
    branches: last.branches,
    grand: true,
  });
  const bloom: Bloom = {
    genome,
    flower: stalk.tiers.length,
    origin: new THREE.Vector3(0, stalk.top + GRAND_RISE, 0),
    axis: up.clone(),
    size: 11 + 11 * Math.min(1, commits / FULL_HISTORY),
    base: flowerColor(tierColor(last)),
    grand: true,
  };
  const info: BloomInfo = {
    genome,
    tier: null,
    sha: last.seed,
    commits,
    from: Math.min(...stalk.tiers.map((t) => t.from)),
    to: Math.max(...stalk.tiers.map((t) => t.to)),
  };
  stemOf(
    b,
    bloom,
    [0, 1, 2, 3, 4].map((i) => new THREE.Vector3(0, stalk.top - 6 + (i * (GRAND_RISE + 6)) / 4, 0)),
  );
  addBloom(b, bloom, { low });
  return { bloom, info };
}

/**
 * The garden: one flower per tier, grown from its first commit's hash, and a great bloom on the spire whose size follows the
 * length of the history. A few tiers (those with merges, or with parallel branches) also put out glass twigs ending in buds.
 * One mesh and one points object whatever the number of flowers. Pure given the stalk.
 */
export function gardenOf(stalk: Stalk, low: boolean): Garden | null {
  if (!stalk.tiers.length) return null;
  const b = new MeshBuilder();
  const { blooms, infos, twigs } = tierFlowers(b, stalk, low);
  const crown = crownFlower(b, stalk, low);
  blooms.push(crown.bloom);
  infos.push(crown.info);
  const climb: (number | null)[] = infos.map(() => null);
  // A small flower for each recent merge, in the strand's own glass; none on low quality.
  for (const { bloom, node } of low ? [] : mergeStands(stalk, infos.length)) {
    infos.push({
      genome: bloom.genome,
      tier: null,
      sha: node.sha,
      commits: 1,
      from: node.at,
      to: node.at,
      merge: { subject: node.subject, strand: node.strand },
    });
    climb.push(node.position[1]);
    addBloom(b, bloom, { low: true });
  }
  return {
    mesh: b.geometry(),
    pollen: low ? null : pollenOf(blooms),
    blooms: infos,
    climb,
    triangles: b.triangles,
    twigs,
  };
}

import { contrast, hexToHsl, hslToHex, shift } from './color.js';
import { EYE_STYLES, MOUTH_STYLES, type EyeStyle, type MouthStyle } from './face.js';
import { GEAR, type Gear } from './gear.js';
import { SPECIES, speciesOf, type Marking, type Species } from './species.js';

/** Hues a seed may reach for an accessory; every one reads on fur and on both backdrops. */
const GEAR_COLORS = [
  '#3C9AB0',
  '#E2493A',
  '#E7B64C',
  '#7C6BE0',
  '#46B58A',
  '#D8663A',
  '#E877A8',
] as const;

const EYE_WEIGHTS: Record<(typeof EYE_STYLES)[number], number> = {
  round: 4,
  sleepy: 2,
  sparkle: 2,
  wink: 1,
  focused: 2,
  star: 1,
  tired: 1,
  determined: 2,
};
const MOUTH_WEIGHTS: Record<MouthStyle, number> = {
  smile: 4,
  grin: 2,
  neutral: 2,
  tongue: 1,
  surprised: 1,
  smirk: 2,
};

export interface AvatarSpec {
  species: Species;
  fur: string;
  light: string;
  dark: string;
  accent: string;
  inner: string;
  backdrop: string;
  /** True when the backdrop is the dark one (so a mark drawn on it should be light). */
  backdropDark: boolean;
  marking: Marking;
  eyes: EyeStyle;
  mouth: MouthStyle;
  blush: boolean;
  earTilt: number;
  earScale: number;
  gear: readonly { gear: Gear; color: string }[];
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32: a small seeded stream, so the same id always draws the same portrait. */
function stream(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(items: readonly T[], weight: (item: T) => number, r: number): T {
  let left = r * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) {
    left -= weight(item);
    if (left < 0) return item;
  }
  const last = items.at(-1);
  if (last === undefined) throw new Error('weighted: empty items');
  return last;
}

/** One of `items`, chosen by `r` in [0, 1). */
function pickOf<T>(items: readonly T[], r: number): T {
  const item = items[Math.floor(r * items.length)];
  if (item === undefined) throw new Error('pickOf: empty items');
  return item;
}

function pickGear(species: Species, rand: () => number): AvatarSpec['gear'] {
  const count = (r: number) => (r < 0.35 ? 0 : r < 0.8 ? 1 : 2);
  const chosen: Gear[] = [];
  for (let n = count(rand()); n > 0; n--) {
    const open = GEAR.filter(
      (g) =>
        !chosen.some((c) => c.slot === g.slot) &&
        !(g.clashesWithHead && chosen.some((c) => c.slot === 'head')) &&
        !(g.slot === 'head' && chosen.some((c) => c.clashesWithHead)) &&
        !(g.noTallEars && SPECIES[species].ears === 'long'),
    );
    chosen.push(weighted(open, (g) => g.weight, rand()));
  }
  return chosen.map((gear) => ({ gear, color: pickOf(GEAR_COLORS, rand()) }));
}

/** The portrait is a pure function of the seed (a member id or session key) and the species the 3D model uses. */
export function avatarSpec(seed: string, speciesName: string): AvatarSpec {
  const species = speciesOf(speciesName, (n) => Math.floor(stream(`species|${seed}`)() * n));
  const art = SPECIES[species];
  const rand = stream(`${species}|${seed}`);
  const hue = (rand() - 0.5) * 20;
  const sat = 0.9 + rand() * 0.2;
  const light = (rand() - 0.5) * 0.08;
  const accentHue = (rand() - 0.5) * 50;
  const fur = shift(art.fur, hue, sat, light);
  const accent = shift(art.accent, accentHue, sat);
  const [accentH] = hexToHsl(accent);
  const dark = hslToHex([accentH, 0.3, 0.14]);
  const pale = hslToHex([accentH, 0.35, 0.9]);
  const backdropDark = contrast(fur, dark) >= contrast(fur, pale);
  return {
    species,
    fur,
    light: shift(art.light, hue, sat),
    dark: shift(art.dark, hue, sat, light),
    accent,
    inner: shift(art.inner, hue, sat),
    backdrop: backdropDark ? dark : pale,
    backdropDark,
    marking: pickOf(art.markings, rand()),
    eyes: weighted(EYE_STYLES, (s) => EYE_WEIGHTS[s], rand()),
    mouth: weighted(MOUTH_STYLES, (s) => MOUTH_WEIGHTS[s], rand()),
    blush: rand() < 0.4,
    earTilt: Math.floor(rand() * 3) * 6 - 6,
    earScale: 0.92 + rand() * 0.16,
    gear: pickGear(species, rand),
  };
}

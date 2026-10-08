import type { Agent } from '@aether/contracts';

export type Species = Agent['species'];
export type Marking = 'none' | 'stripes' | 'spots' | 'blaze' | 'patch';

/**
 * What makes each animal read as itself in a portrait. The colors are the 3D model's own (tools/blender/animal_profiles.py),
 * so the avatar looks like the figure at the desk; `markings` is the set a seed may pick from, `intrinsic` is always drawn.
 */
interface SpeciesArt {
  fur: string;
  light: string;
  dark: string;
  accent: string;
  inner: string;
  nose: string;
  ears: 'tri' | 'long' | 'round' | 'flop';
  earColor: 'fur' | 'dark';
  earSize: number;
  muzzle: 'lower' | 'cheeks' | 'none';
  intrinsic: 'none' | 'eyes' | 'mask';
  markings: readonly Marking[];
}

export const SPECIES: Record<Species, SpeciesArt> = {
  fox: {
    fur: '#D8702C',
    light: '#F8E9D2',
    dark: '#3B2B27',
    accent: '#E2493A',
    inner: '#F3D9BD',
    nose: '#252325',
    ears: 'tri',
    earColor: 'dark',
    earSize: 1,
    muzzle: 'cheeks',
    intrinsic: 'none',
    markings: ['none', 'blaze', 'spots'],
  },
  rabbit: {
    fur: '#EDE5D9',
    light: '#FFF8EF',
    dark: '#C9BBAA',
    accent: '#EE9DBB',
    inner: '#EBB1B0',
    nose: '#D98F95',
    ears: 'long',
    earColor: 'fur',
    earSize: 1,
    muzzle: 'lower',
    intrinsic: 'none',
    markings: ['none', 'blaze', 'spots'],
  },
  panda: {
    fur: '#F2EFE7',
    light: '#FFFFFF',
    dark: '#25282B',
    accent: '#3C9AB0',
    inner: '#25282B',
    nose: '#1D2023',
    ears: 'round',
    earColor: 'dark',
    earSize: 1,
    muzzle: 'none',
    intrinsic: 'eyes',
    markings: ['none', 'spots'],
  },
  cat: {
    fur: '#8C969C',
    light: '#EFE3D6',
    dark: '#5C666C',
    accent: '#E7B64C',
    inner: '#E9B3AC',
    nose: '#D68E8F',
    ears: 'tri',
    earColor: 'fur',
    earSize: 0.85,
    muzzle: 'lower',
    intrinsic: 'none',
    markings: ['none', 'stripes', 'spots', 'blaze'],
  },
  dog: {
    fur: '#C8935A',
    light: '#F6E2C3',
    dark: '#8A5A33',
    accent: '#D6483F',
    inner: '#8A5A33',
    nose: '#221F20',
    ears: 'flop',
    earColor: 'dark',
    earSize: 1,
    muzzle: 'lower',
    intrinsic: 'none',
    markings: ['none', 'patch', 'spots', 'blaze'],
  },
  raccoon: {
    fur: '#8D938E',
    light: '#ECE6D8',
    dark: '#2D3033',
    accent: '#7C6BE0',
    inner: '#2D3033',
    nose: '#1C1E20',
    ears: 'round',
    earColor: 'fur',
    earSize: 0.9,
    muzzle: 'lower',
    intrinsic: 'mask',
    markings: ['none', 'stripes'],
  },
  otter: {
    fur: '#8A6A47',
    light: '#EAD9BC',
    dark: '#5E4630',
    accent: '#46A8C9',
    inner: '#5E4630',
    nose: '#261E1A',
    ears: 'round',
    earColor: 'fur',
    earSize: 0.65,
    muzzle: 'lower',
    intrinsic: 'none',
    markings: ['none', 'spots', 'blaze'],
  },
  bear: {
    fur: '#7D553D',
    light: '#DCBE96',
    dark: '#4A3125',
    accent: '#D8663A',
    inner: '#DCBE96',
    nose: '#1F1814',
    ears: 'round',
    earColor: 'fur',
    earSize: 1,
    muzzle: 'lower',
    intrinsic: 'none',
    markings: ['none', 'blaze', 'spots'],
  },
};

export const SPECIES_LIST = Object.keys(SPECIES) as Species[];

/** A sender that is not one of the office animals (a person) still gets a stable species from its seed. */
export function speciesOf(value: string, pick: (n: number) => number): Species {
  if (value in SPECIES) return value as Species;
  const species = SPECIES_LIST[pick(SPECIES_LIST.length) % SPECIES_LIST.length];
  if (species === undefined) throw new Error('species list empty');
  return species;
}

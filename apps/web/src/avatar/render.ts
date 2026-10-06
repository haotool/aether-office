import { eyes, mouth, INK } from './face.js';
import { avatarSpec, type AvatarSpec } from './spec.js';
import { avatarState, stateLook, type AvatarState } from './state.js';
import { SPECIES } from './species.js';

const CLOTH = '#3F6F78';
const BLUSH = '#F28FA3';

/** The two halves that never change with the state: everything behind the face and everything in front of it. */
interface AvatarParts {
  back: string;
  eyes: string;
  mouth: string;
  front: string;
}

const fill = (shape: string, color: string, extra = '') => `<${shape} fill="${color}"${extra}/>`;

function ears(spec: AvatarSpec): string {
  const art = SPECIES[spec.species];
  const outer = art.earColor === 'fur' ? spec.fur : spec.dark;
  const [pivot, shapes] = {
    tri: [
      '20 24',
      [
        fill('path d="M12.5 29 L14.5 7 L30 20Z"', outer),
        fill('path d="M16.5 24 L17.5 12.5 L25.5 20Z"', spec.inner),
      ],
    ],
    long: [
      '22 24',
      [
        fill('ellipse cx="22" cy="11" rx="6.2" ry="15" transform="rotate(-8 22 11)"', outer),
        fill('ellipse cx="22" cy="11.5" rx="3" ry="11" transform="rotate(-8 22 11)"', spec.inner),
      ],
    ],
    round: [
      '17 25',
      [
        fill('circle cx="15.5" cy="21" r="7.5"', outer),
        fill('circle cx="15.5" cy="21" r="4"', spec.inner),
      ],
    ],
    flop: [
      '14 24',
      [fill('ellipse cx="11.5" cy="32" rx="6.5" ry="12" transform="rotate(14 11.5 32)"', outer)],
    ],
  }[art.ears] as [string, string[]];
  const [px, py] = pivot.split(' ');
  const scale = spec.earScale * art.earSize;
  const one = `<g transform="translate(${px} ${py}) rotate(${spec.earTilt}) scale(${scale.toFixed(2)}) translate(-${px} -${py})">${shapes.join('')}</g>`;
  return one + `<g transform="matrix(-1 0 0 1 64 0)">${one}</g>`;
}

function muzzle(spec: AvatarSpec): string {
  const kind = SPECIES[spec.species].muzzle;
  if (kind === 'lower') return fill('ellipse cx="32" cy="46" rx="11" ry="8"', spec.light);
  if (kind === 'cheeks')
    return [
      fill('ellipse cx="22" cy="45.5" rx="10" ry="7.5"', spec.light),
      fill('ellipse cx="42" cy="45.5" rx="10" ry="7.5"', spec.light),
      fill('ellipse cx="32" cy="47.5" rx="7" ry="6"', spec.light),
    ].join('');
  return '';
}

/** The dark patches round the eyes (panda, raccoon, a dog's patch) and which eyes sit on one. */
function patches(spec: AvatarSpec): { shapes: string; backed: number[] } {
  const { intrinsic } = SPECIES[spec.species];
  if (intrinsic === 'eyes')
    return {
      shapes:
        fill('ellipse cx="24" cy="34" rx="6" ry="7.4" transform="rotate(18 24 34)"', spec.dark) +
        fill('ellipse cx="40" cy="34" rx="6" ry="7.4" transform="rotate(-18 40 34)"', spec.dark),
      backed: [24, 40],
    };
  if (intrinsic === 'mask')
    return {
      shapes: fill(
        'path d="M12.5 31 Q32 22.5 51.5 31 Q51 40.5 41.5 39.5 Q32 36.5 22.5 39.5 Q13 40.5 12.5 31Z"',
        spec.dark,
      ),
      backed: [24, 40],
    };
  if (spec.marking === 'patch')
    return { shapes: fill('ellipse cx="40" cy="33.5" rx="7" ry="7.6"', spec.dark), backed: [40] };
  return { shapes: '', backed: [] };
}

function marking(spec: AvatarSpec): string {
  const stroke = (d: string) =>
    `<path d="${d}" fill="none" stroke="${spec.dark}" stroke-width="1.8" stroke-linecap="round"/>`;
  switch (spec.marking) {
    case 'stripes':
      return stroke('M32 19.5 V25.5 M26 20.5 L27 25.5 M38 20.5 L37 25.5');
    case 'spots':
      return [
        [21, 28.5, 1.7],
        [43.5, 27.5, 1.4],
        [47, 42, 1.3],
        [17.5, 40.5, 1.2],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${spec.dark}" fill-opacity=".6"/>`,
        )
        .join('');
    case 'blaze':
      return fill('path d="M32 18.5 Q36 26 32 33 Q28 26 32 18.5Z"', spec.light);
    default:
      return '';
  }
}

export function avatarParts(spec: AvatarSpec): AvatarParts {
  const art = SPECIES[spec.species];
  const { shapes, backed } = patches(spec);
  const cheeks = spec.blush
    ? [19.5, 44.5]
        .map((x) =>
          fill(`ellipse cx="${x}" cy="42.5" rx="3.2" ry="2"`, BLUSH, ' fill-opacity=".55"'),
        )
        .join('')
    : '';
  const back =
    fill('rect width="64" height="64"', spec.backdrop) +
    fill('path d="M9 64 Q11 53 32 53 Q53 53 55 64Z"', CLOTH) +
    ears(spec) +
    fill('ellipse cx="32" cy="37" rx="21" ry="18"', spec.fur) +
    muzzle(spec) +
    marking(spec) +
    shapes +
    backed.map((x) => fill(`circle cx="${x}" cy="34" r="4.6"`, '#fff')).join('') +
    cheeks +
    fill('ellipse cx="32" cy="41" rx="2.7" ry="2"', art.nose);
  return {
    back,
    eyes: eyes(spec.eyes),
    mouth: mouth(spec.mouth),
    front: spec.gear.map(({ gear, color }) => gear.draw(color)).join(''),
  };
}

/** The portrait as an SVG string: base identity from the seed, plus the state's eyes, mouth and mark. */
export function renderAvatar(seed: string, species: string, state: AvatarState = 'idle'): string {
  const spec = avatarSpec(seed, species);
  const parts = avatarParts(spec);
  const look = stateLook(state, spec.backdropDark ? '#F4F6F8' : INK);
  const face = look.eyes ? eyes(look.eyes) : parts.eyes;
  const lips = look.mouth ? mouth(look.mouth) : parts.mouth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${parts.back}${face}${lips}${parts.front}${look.overlay}</svg>`;
}

export { avatarSpec, avatarState };
export type { AvatarState };

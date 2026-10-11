import { memo } from 'react';
import { CornerDownRight } from 'lucide-react';
import { renderAvatar, type AvatarState } from '../../avatar/render.js';

type AvatarSize = 'chip' | 'row' | 'member' | 'peek' | 'card';

const CACHE_LIMIT = 400;
const cache = new Map<string, string>();

export function avatarUrl(seed: string, species: string, state: AvatarState): string {
  const key = `${seed}\u0000${species}\u0000${state}`;
  let svg = cache.get(key);
  if (svg === undefined) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    svg = `data:image/svg+xml;utf8,${encodeURIComponent(renderAvatar(seed, species, state))}`;
    cache.set(key, svg);
  }
  return svg;
}

/**
 * Decorative next to a name (`aria-hidden`); give it a `label` where it stands alone. It is an image, so nothing in it
 * can run.
 */
export const Avatar = memo(function Avatar({
  seed,
  species,
  size = 'member',
  state = 'idle',
  label,
  squadHue,
  tether = false,
}: {
  seed: string;
  species: string;
  size?: AvatarSize;
  state?: AvatarState;
  label?: string;
  squadHue?: number;
  tether?: boolean;
}) {
  return (
    <span
      className={`avatar-icon avatar-${size}`}
      data-squad={squadHue}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <img src={avatarUrl(seed, species, state)} alt="" draggable={false} />
      {tether && (
        <i className="avatar-tether">
          <CornerDownRight size={9} aria-hidden="true" />
        </i>
      )}
    </span>
  );
});

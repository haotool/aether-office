import { useCallback, useRef, useState } from 'react';
import { SPRITE_MS, emoteGate, emoteOf, withSprite, type EmoteId, type Sprite } from './emotes.js';
import type { PoseApi } from './use-pose-cues.js';

export type EmoteResult = 'played' | 'cooldown';

/**
 * Emotes: the icons floating over characters' heads, and the clip each one is asked to play, which goes through the pose
 * registry (the person outranks every other source). One per character per cooldown (see emotes.ts); the character's own
 * clip logic returns it to what it was doing.
 */
export function useEmotes(pose: PoseApi['request']) {
  const [sprites, setSprites] = useState<readonly Sprite[]>([]);
  const last = useRef(new Map<string, number>());
  const keys = useRef(0);
  const play = useCallback(
    (id: string, emote: EmoteId, now = Date.now()): EmoteResult => {
      if (!emoteGate(last.current.get(id), now).ok) return 'cooldown';
      last.current.set(id, now);
      keys.current += 1;
      const { clip, icon } = emoteOf(emote);
      pose({ member: id, source: 'emote', clip }, now);
      const key = keys.current;
      setSprites((all) => withSprite(all, { key, id, icon, at: now }));
      setTimeout(() => setSprites((all) => all.filter((s) => s.key !== key)), SPRITE_MS);
      return 'played';
    },
    [pose],
  );
  return { sprites, play };
}

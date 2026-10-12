import { useCallback, useRef, useState } from 'react';
import {
  SPRITE_MS,
  emoteGate,
  emoteOf,
  withSprite,
  type EmoteId,
  type Sprite,
} from '../animals/emotes.js';
import type { PoseApi } from './use-pose-cues.js';

export type EmoteResult = 'played' | 'cooldown';

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

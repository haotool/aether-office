import { useCallback, useRef, useState } from 'react';
import type { EmoteCue } from './Animal.js';
import { SPRITE_MS, emoteGate, emoteOf, withSprite, type EmoteId, type Sprite } from './emotes.js';

export type EmoteResult = 'played' | 'cooldown';

/**
 * Emotes: the clip cue each character is asked to play and the icons floating over their heads. One per character per
 * cooldown (see emotes.ts); the character's own clip logic returns it to what it was doing.
 */
export function useEmotes() {
  const [cues, setCues] = useState<Readonly<Record<string, EmoteCue>>>({});
  const [sprites, setSprites] = useState<readonly Sprite[]>([]);
  const last = useRef(new Map<string, number>());
  const keys = useRef(0);
  const play = useCallback((id: string, emote: EmoteId, now = Date.now()): EmoteResult => {
    if (!emoteGate(last.current.get(id), now).ok) return 'cooldown';
    last.current.set(id, now);
    keys.current += 1;
    const { clip, icon } = emoteOf(emote);
    setCues((all) => ({ ...all, [id]: { clip, key: keys.current } }));
    const key = keys.current;
    setSprites((all) => withSprite(all, { key, id, icon, at: now }));
    setTimeout(() => setSprites((all) => all.filter((s) => s.key !== key)), SPRITE_MS);
    return 'played';
  }, []);
  return { cues, sprites, play };
}

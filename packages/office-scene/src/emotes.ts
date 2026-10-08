import type { ClipName } from './animal-states.js';

/**
 * The small reactions a person can make a character do: a clip the animal model already carries and a short-lived icon
 * over its head. They are only drawn; nothing is sent to the session, and the character returns to what it was doing.
 */
export const EMOTE_IDS = ['wave', 'thumbs_up', 'high_five', 'cheer', 'stretch', 'pat'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];
export type Emote = { id: EmoteId; clip: ClipName; icon: string };

const EMOTE_TABLE: Record<EmoteId, Emote> = {
  wave: { id: 'wave', clip: 'wave', icon: '👋' },
  thumbs_up: { id: 'thumbs_up', clip: 'nod', icon: '👍' }, // no thumbs-up clip: a firm nod is the closest
  high_five: { id: 'high_five', clip: 'celebrate', icon: '🙌' },
  cheer: { id: 'cheer', clip: 'cheer', icon: '🎉' },
  stretch: { id: 'stretch', clip: 'stretch', icon: '🙆' },
  pat: { id: 'pat', clip: 'nod', icon: '💗' },
};
export const EMOTES: readonly Emote[] = EMOTE_IDS.map((id) => EMOTE_TABLE[id]);
export const emoteOf = (id: EmoteId): Emote => EMOTE_TABLE[id];

/** A character takes one emote per this long; a second tap inside it is ignored, not queued. */
export const EMOTE_COOLDOWN_MS = 2500;
/** How long an icon floats over a head. */
export const SPRITE_MS = 1800;
/** Icons on screen at once, across all characters: a click storm cannot cover the scene. */
export const MAX_SPRITES = 4;

/** Pure. May this character emote now? `lastAt` is when it last did (undefined: never). */
export function emoteGate(
  lastAt: number | undefined,
  now: number,
): { ok: true } | { ok: false; waitMs: number } {
  const waitMs = lastAt === undefined ? 0 : lastAt + EMOTE_COOLDOWN_MS - now;
  return waitMs > 0 ? { ok: false, waitMs } : { ok: true };
}

export type Sprite = { key: number; id: string; icon: string; at: number };

/** Pure. The icons still floating when `next` arrives, with `next` added and the oldest dropped past the cap. */
export function withSprite(sprites: readonly Sprite[], next: Sprite): Sprite[] {
  return [...sprites.filter((s) => next.at - s.at < SPRITE_MS), next].slice(-MAX_SPRITES);
}

/** Why a character cannot emote right now, or null: a sleeping rabbit, a ghost and a member walking out do not. */
export function emoteBlock(state: {
  apparition: string | undefined;
  leaving: boolean;
}): 'apparition' | 'leaving' | null {
  return state.apparition ? 'apparition' : state.leaving ? 'leaving' : null;
}

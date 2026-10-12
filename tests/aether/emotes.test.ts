import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIPS } from '../../packages/office-scene/src/animals/animal-states.js';
import {
  EMOTES,
  EMOTE_COOLDOWN_MS,
  EMOTE_IDS,
  MAX_SPRITES,
  SPRITE_MS,
  emoteBlock,
  emoteGate,
  withSprite,
  type Sprite,
} from '../../packages/office-scene/src/animals/emotes.js';
import { createLongPress } from '../../packages/office-scene/src/core/long-press.js';
import { insideMarquee } from '../../packages/office-scene/src/core/use-marquee.js';

describe('emotes', () => {
  it('reuse clips the animal models carry, one emote per id', () => {
    expect(EMOTES.map((e) => e.id)).toEqual([...EMOTE_IDS]);
    for (const emote of EMOTES) expect(CLIPS, emote.id).toContain(emote.clip);
    expect(new Set(EMOTES.map((e) => e.icon)).size).toBe(EMOTES.length);
  });

  it('are limited to one per character per cooldown, and say how long to wait', () => {
    expect(emoteGate(undefined, 1000)).toEqual({ ok: true });
    expect(emoteGate(1000, 1000)).toEqual({ ok: false, waitMs: EMOTE_COOLDOWN_MS });
    expect(emoteGate(1000, 1000 + EMOTE_COOLDOWN_MS - 1)).toEqual({ ok: false, waitMs: 1 });
    expect(emoteGate(1000, 1000 + EMOTE_COOLDOWN_MS)).toEqual({ ok: true });
  });

  it('keep at most a few icons on screen, dropping the oldest, and forget the ones that have faded', () => {
    const sprite = (key: number, at: number): Sprite => ({ key, id: `m${key}`, icon: '👋', at });
    let sprites: Sprite[] = [];
    for (let i = 0; i < MAX_SPRITES + 3; i++) sprites = withSprite(sprites, sprite(i, 100 + i));
    expect(sprites.map((s) => s.key)).toEqual([3, 4, 5, 6]);
    expect(withSprite(sprites, sprite(9, 100 + SPRITE_MS + 50)).map((s) => s.key)).toEqual([9]);
  });

  it('are not for a sleeping rabbit, a ghost or a member on the way out', () => {
    expect(emoteBlock({ apparition: undefined, leaving: false })).toBeNull();
    expect(emoteBlock({ apparition: 'ghost', leaving: false })).toBe('apparition');
    expect(emoteBlock({ apparition: 'sleeping_rabbit', leaving: false })).toBe('apparition');
    expect(emoteBlock({ apparition: undefined, leaving: true })).toBe('leaving');
  });
});

describe('press and hold', () => {
  afterEach(() => vi.useRealTimers());

  it('fires once after the hold time, and the click that follows it is its own', () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const press = createLongPress(fired, 500, 10);
    press.start(100, 100);
    vi.advanceTimersByTime(499);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    press.end();
    expect(press.consumeClick()).toBe(true);
    expect(press.consumeClick()).toBe(false);
  });

  it('is cancelled by a finger that moves (a drag of the camera) or lifts early', () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const press = createLongPress(fired, 500, 10);
    press.start(100, 100);
    press.move(104, 104);
    press.move(130, 100);
    vi.advanceTimersByTime(600);
    expect(fired).not.toHaveBeenCalled();
    press.start(0, 0);
    vi.advanceTimersByTime(200);
    press.end();
    vi.advanceTimersByTime(600);
    expect(fired).not.toHaveBeenCalled();
    expect(press.consumeClick()).toBe(false);
  });
});

describe('marquee selection', () => {
  it('picks the characters whose screen position is inside the rectangle, edges included', () => {
    const points = new Map<string, [number, number]>([
      ['in', [50, 50]],
      ['edge', [100, 100]],
      ['out', [101, 50]],
    ]);
    expect(insideMarquee({ x: 0, y: 0, width: 100, height: 100 }, points).sort()).toEqual([
      'edge',
      'in',
    ]);
  });
});

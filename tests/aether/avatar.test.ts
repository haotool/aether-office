import { describe, expect, it } from 'vitest';
import { contrast } from '../../apps/web/src/avatar/color.js';
import { avatarParts, renderAvatar } from '../../apps/web/src/avatar/render.js';
import { avatarSpec } from '../../apps/web/src/avatar/spec.js';
import { SPECIES_LIST } from '../../apps/web/src/avatar/species.js';
import { avatarState, type AvatarState } from '../../apps/web/src/avatar/state.js';

const ids = Array.from({ length: 500 }, (_, i) => `agent-${i}-${(i * 7919).toString(36)}`);
const STATES: AvatarState[] = ['idle', 'working', 'needs', 'sleeping', 'error', 'finished'];

describe('avatar', () => {
  it('is a pure function of the id and species', () => {
    for (const id of ids.slice(0, 40)) {
      expect(renderAvatar(id, 'fox')).toBe(renderAvatar(id, 'fox'));
      expect(avatarSpec(id, 'cat')).toEqual(avatarSpec(id, 'cat'));
    }
    expect(renderAvatar('a', 'fox')).not.toBe(renderAvatar('b', 'fox'));
  });

  it('varies widely across ids and gives every species its own animal', () => {
    for (const species of SPECIES_LIST) {
      const distinct = new Set(ids.map((id) => renderAvatar(id, species)));
      expect(distinct.size).toBeGreaterThan(400);
    }
    const picked = new Set(ids.map((id) => avatarSpec(id, 'human').species));
    expect(picked.size).toBe(SPECIES_LIST.length);
    const combos = new Set(
      ids.map((id) => {
        const s = avatarSpec(id, 'bear');
        return [s.eyes, s.mouth, s.marking, s.blush, s.gear.map((g) => g.gear.id).join('+')].join(
          '|',
        );
      }),
    );
    expect(combos.size).toBeGreaterThan(80);
  });

  it('never stacks two accessories in a slot or a band over a hat', () => {
    let two = 0;
    for (const id of ids)
      for (const species of SPECIES_LIST) {
        const gear = avatarSpec(id, species).gear.map((g) => g.gear);
        expect(gear.length).toBeLessThanOrEqual(2);
        expect(new Set(gear.map((g) => g.slot)).size).toBe(gear.length);
        if (gear.some((g) => g.clashesWithHead))
          expect(gear.some((g) => g.slot === 'head')).toBe(false);
        if (species === 'rabbit') expect(gear.some((g) => g.noTallEars)).toBe(false);
        if (gear.length === 2) two++;
      }
    expect(two).toBeGreaterThan(0);
  });

  it('keeps the fur readable on its backdrop and the palette near the species', () => {
    for (const id of ids)
      for (const species of SPECIES_LIST) {
        const spec = avatarSpec(id, species);
        expect(contrast(spec.fur, spec.backdrop)).toBeGreaterThanOrEqual(3);
        expect(
          contrast(spec.backdropDark ? '#F4F6F8' : '#16181D', spec.backdrop),
        ).toBeGreaterThanOrEqual(10);
      }
  });

  it('is well-formed SVG under 4 KB for every state', () => {
    for (const id of ids.slice(0, 100))
      for (const species of SPECIES_LIST)
        for (const state of STATES) {
          const svg = renderAvatar(id, species, state);
          expect(svg.length).toBeLessThan(4096);
          expect(svg.startsWith('<svg ') && svg.endsWith('</svg>')).toBe(true);
          const tags = [...svg.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/g)];
          const open: string[] = [];
          for (const [, closing, name, , selfClosing] of tags) {
            if (selfClosing) continue;
            if (closing) expect(open.pop()).toBe(name);
            else open.push(name!);
          }
          expect(open).toEqual([]);
          expect(svg).not.toMatch(/NaN|undefined/);
        }
  });

  it('a state changes the face and adds a mark, never the identity', () => {
    for (const id of ids.slice(0, 60)) {
      const spec = avatarSpec(id, 'panda');
      const base = avatarParts(spec);
      for (const state of STATES) {
        const svg = renderAvatar(id, 'panda', state);
        expect(svg).toContain(base.back);
        expect(svg).toContain(base.front);
      }
      expect(renderAvatar(id, 'panda', 'idle')).toContain(base.eyes + base.mouth);
      expect(renderAvatar(id, 'panda', 'sleeping')).not.toBe(renderAvatar(id, 'panda', 'idle'));
    }
  });

  it('maps an agent activity to a state', () => {
    expect(avatarState('working')).toBe('working');
    expect(avatarState('waiting_permission')).toBe('needs');
    expect(avatarState('offline')).toBe('sleeping');
    expect(avatarState('error')).toBe('error');
    expect(avatarState('idle')).toBe('idle');
    expect(avatarState(undefined)).toBe('idle');
  });

  it('keeps a few seeds as they are', () => {
    for (const [id, species] of [
      ['alpha', 'fox'],
      ['beta', 'rabbit'],
      ['gamma', 'raccoon'],
    ] as const) {
      const s = avatarSpec(id, species);
      expect({ ...s, gear: s.gear.map((g) => `${g.gear.id}:${g.color}`) }).toMatchSnapshot();
    }
  });
});

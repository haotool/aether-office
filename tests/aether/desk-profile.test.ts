import { describe, expect, it } from 'vitest';
import {
  DESK_WEIGHTS,
  MONITOR_CHANCE,
  deskProfile,
  type DeskProfile,
} from '../../packages/office-scene/src/desk-profile.js';

const seeds = Array.from({ length: 200 }, (_, i) => `member-${i}`);
const share = (profiles: DeskProfile[], pick: (p: DeskProfile) => boolean) =>
  profiles.filter(pick).length / profiles.length;

describe('desk profile', () => {
  it('is the same for the same member and role, and differs across members', () => {
    expect(deskProfile('member-1', 'frontend')).toEqual(deskProfile('member-1', 'frontend'));
    const all = seeds.map((s) => JSON.stringify(deskProfile(s, 'frontend')));
    expect(new Set(all).size).toBeGreaterThan(60);
  });

  it('keeps the editor theme mix within its configured weights over 200 members', () => {
    const profiles = seeds.map((s) => deskProfile(s, 'backend'));
    const dark = DESK_WEIGHTS.theme.dark / (DESK_WEIGHTS.theme.dark + DESK_WEIGHTS.theme.light);
    expect(Math.abs(share(profiles, (p) => p.theme === 'dark') - dark)).toBeLessThan(0.1);
    for (const chrome of ['mac', 'win', 'flat'] as const)
      expect(share(profiles, (p) => p.chrome === chrome)).toBeGreaterThan(0.12);
  });

  it('gives some roles a second monitor more often than others, near the configured chance', () => {
    for (const role of ['backend', 'docs', 'sre'])
      expect(
        Math.abs(
          share(
            seeds.map((s) => deskProfile(s, role)),
            (p) => p.monitors === 2,
          ) - (MONITOR_CHANCE[role] ?? MONITOR_CHANCE.default),
        ),
      ).toBeLessThan(0.1);
    for (const s of seeds) {
      const p = deskProfile(s, 'backend');
      expect(p.secondary === null).toBe(p.monitors === 1);
    }
  });

  it('puts one to three different things on the desk, and every kind turns up', () => {
    const seen = new Set<string>();
    for (const s of seeds) {
      const { items } = deskProfile(s, 'generalist');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(3);
      expect(new Set(items).size).toBe(items.length);
      items.forEach((i) => seen.add(i));
    }
    expect([...seen].sort()).toEqual(
      ['figure', 'headphones', 'mug', 'notepad', 'plant', 'sticky'].sort(),
    );
  });
});

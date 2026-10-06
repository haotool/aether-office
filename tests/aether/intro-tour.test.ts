import { describe, expect, it } from 'vitest';
import {
  INTRO_TIMELINE,
  START_BEARING,
  crownHeights,
  farther,
  introLength,
  introPoseAt,
  introSegmentAt,
  orbitShare,
  type IntroFrame,
} from '../../packages/office-scene/src/intro/intro-tour.js';
import { MIN_DISTANCE, type Pose } from '../../packages/office-scene/src/shot-camera.js';

const HOME: Pose = { position: [30, 34, 44], target: [0, 0, 0], fov: 38 };
const frame = (over: Partial<IntroFrame> = {}): IntroFrame => ({
  aspect: 1.6,
  tiers: 6,
  reduced: false,
  home: HOME,
  ...over,
});
const FRAMES = {
  desktop: frame(),
  tall: frame({ tiers: 12 }),
  phone: frame({ aspect: 0.46, tiers: 6 }),
  phoneTall: frame({ aspect: 0.46, tiers: 12 }),
  noRepo: frame({ tiers: 0 }),
};
const STEP = 1 / 60;
const DEG = 180 / Math.PI;

const look = (p: Pose) => {
  const d = p.target.map((v, i) => v - p.position[i]!);
  const n = Math.hypot(...d);
  return d.map((v) => v / n);
};
const pitchOf = (p: Pose) => {
  const d = p.target.map((v, i) => v - p.position[i]!);
  return Math.atan2(-d[1]!, Math.hypot(d[0]!, d[2]!)) * DEG; // below the horizon is positive
};
const distanceOf = (p: Pose) => Math.hypot(...p.target.map((v, i) => v - p.position[i]!));

/** Samples of the tour at 60 Hz, with the segment each belongs to. */
const samples = (f: IntroFrame) =>
  Array.from({ length: Math.floor(introLength(f.reduced) / STEP) }, (_, i) => {
    const t = i * STEP;
    return { t, segment: introSegmentAt(t, f.reduced)!, pose: introPoseAt(t, f) };
  });

describe('the intro tour timeline', () => {
  it('lasts no more than 46 seconds and the segments tile it with no gap', () => {
    const full = INTRO_TIMELINE.full;
    expect(introLength(false)).toBeCloseTo(45.8, 6);
    expect(introLength(false)).toBeLessThanOrEqual(46);
    full.forEach((s, i) => {
      if (i) expect(s.from).toBe(full[i - 1]!.to);
    });
    expect(full.map((s) => s.phase)).toEqual(['orbit', 'toExploded', 'rise', 'hold', 'toStacked']);
  });

  it('spreads the building only between the first and the last cut', () => {
    expect(INTRO_TIMELINE.full.map((s) => s.exploded)).toEqual([false, true, true, true, false]);
    expect(introSegmentAt(introLength(false), false)).toBeNull();
  });

  it('the orbit turns exactly once, easing in and out', () => {
    expect(orbitShare(0)).toBe(0);
    expect(orbitShare(26)).toBeCloseTo(1, 12);
    let last = 0;
    for (let t = 0; t <= 26; t += 0.05) {
      expect(orbitShare(t)).toBeGreaterThanOrEqual(last);
      last = orbitShare(t);
    }
    expect(orbitShare(2) - orbitShare(0)).toBeLessThan(orbitShare(14) - orbitShare(12)); // slower at the start than cruising
  });
});

describe('introPoseAt: comfort', () => {
  for (const [name, f] of Object.entries(FRAMES)) {
    describe(name, () => {
      const all = samples(f);
      const playing = all.filter((s) => !s.segment.dip);

      it('turns the view no faster than 16.5 degrees a second outside the cuts', () => {
        let worst = 0;
        for (let i = 1; i < all.length; i += 1) {
          const [a, b] = [all[i - 1]!, all[i]!];
          if (a.segment !== b.segment || b.segment.dip) continue;
          const [u, v] = [look(a.pose), look(b.pose)];
          const dot = Math.min(
            1,
            u.reduce((s, x, k) => s + x * v[k]!, 0),
          );
          worst = Math.max(worst, (Math.acos(dot) * DEG) / STEP);
        }
        expect(worst).toBeLessThanOrEqual(16.5);
      });

      it('keeps the horizon level: constant pitch in the orbit and the hold, a steady tilt down in the rise', () => {
        const pitches = (phase: string) =>
          playing.filter((s) => s.segment.phase === phase).map((s) => pitchOf(s.pose));
        for (const phase of ['orbit', 'hold']) {
          const p = pitches(phase);
          expect(Math.max(...p) - Math.min(...p)).toBeLessThan(1e-6);
        }
        const rise = pitches('rise');
        rise.forEach((p, i) => {
          if (i) expect(p).toBeGreaterThanOrEqual(rise[i - 1]! - 1e-9);
        });
        expect(rise[0]!).toBeGreaterThan(0); // always looking down at the building
      });

      it('never zooms: the field of view is constant', () => {
        for (const s of playing) expect(s.pose.fov).toBe(38);
      });

      it('stays out of the shell and within the controls distances', () => {
        const { roof } = crownHeights(f.tiers);
        for (const { pose, segment } of playing) {
          const [x, y, z] = pose.position;
          if (y < roof + 1) expect(Math.abs(x) > 27.2 + 20 || Math.abs(z) > 19.2 + 20).toBe(true);
          expect(distanceOf(pose)).toBeGreaterThanOrEqual(MIN_DISTANCE);
          expect(distanceOf(pose)).toBeLessThanOrEqual(300);
          expect(Number.isFinite(x + y + z)).toBe(true);
          expect(segment.phase).not.toBe('toExploded');
        }
      });

      it('is continuous across the phases that are not cuts, and starts where the ordinary camera looks', () => {
        const at = (t: number) => introPoseAt(t, f).position;
        const close = (a: number[], b: number[]) =>
          a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
        const b = farther(f.aspect);
        close(at(0), [84 * b * Math.sin(START_BEARING), 38, 84 * b * Math.cos(START_BEARING)]);
        close(at(25.9999999), at(0)); // one full turn: the orbit ends where it began
        close(at(26.4 + 15 - 1e-9), introPoseAt(26.4 + 15, f).position); // the rise runs into the hold
      });
    });
  }

  it('frames the whole crown in the hold, even at the most tiers', () => {
    for (const tiers of [1, 6, 12]) {
      const f = frame({ tiers });
      const pose = introPoseAt(41.5, f);
      const { roof, bloom } = crownHeights(tiers);
      const half = (Math.atan(Math.tan((19 * Math.PI) / 180)) * distanceOf(pose)) / 1; // half the view's height at the target
      expect(pose.target[1] - half).toBeLessThanOrEqual(roof);
      expect(pose.target[1] + half).toBeGreaterThanOrEqual(bloom);
    }
  });

  it('with six tiers the crown heights match the spec (top 119.4, bloom 125.4)', () => {
    expect(crownHeights(6).roof).toBe(79);
    expect(crownHeights(6).bloom).toBeCloseTo(125.4, 6);
    expect(crownHeights(0).bloom).toBe(83);
  });

  it('a portrait phone stands farther back so the building fits', () => {
    const wide = introPoseAt(0, frame());
    const phone = introPoseAt(0, frame({ aspect: 0.46 }));
    expect(distanceOf(phone)).toBeGreaterThan(distanceOf(wide) * 2);
  });

  it('ends on the home view and leaves it there', () => {
    expect(introPoseAt(introLength(false), frame())).toEqual(HOME);
    expect(introPoseAt(500, frame())).toEqual(HOME);
    expect(introPoseAt(45.5, frame())).toEqual(HOME); // under the closing dip
  });
});

describe('introPoseAt: reduced motion', () => {
  const f = frame({ reduced: true });
  it('is three still views then the home view, each held for three seconds', () => {
    const a = introPoseAt(0.1, f);
    expect(introPoseAt(2.9, f)).toEqual(a); // the first still does not move
    const b = introPoseAt(4, f);
    expect(introPoseAt(6, f)).toEqual(b);
    const c = introPoseAt(7, f);
    expect(introPoseAt(9, f)).toEqual(c);
    expect(new Set([a, b, c].map((p) => p.position.join()))).toHaveProperty('size', 3);
    expect(introPoseAt(introLength(true) + 1, f)).toEqual(HOME);
    expect(introLength(true)).toBeLessThan(12);
  });
});

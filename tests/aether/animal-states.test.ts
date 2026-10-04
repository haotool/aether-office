import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activitySchema } from '../../packages/contracts/src/index.js';
import {
  APPARITION_CLIP,
  APPARITION_MODEL,
  BASE_CLIP,
  CLIPS,
  FIDGET_MIN_MS,
  FIDGET_SPREAD_MS,
  fidgetDelayMs,
  apparitionOf,
  fidgetFor,
  greets,
  transitionClip,
} from '../../packages/office-scene/src/animal-states.js';

describe('animal states', () => {
  it('shows every activity with a clip the models have', () => {
    expect(Object.keys(BASE_CLIP).sort()).toEqual([...activitySchema.options].sort());
    for (const clip of Object.values(BASE_CLIP)) expect(CLIPS).toContain(clip);
  });

  it('keeps the clip list the same in the Blender source, the asset validator and the scene', () => {
    const python = readFileSync('tools/blender/animal_clips.py', 'utf8');
    const table = python.slice(
      python.indexOf("    return {\n        'idle'"),
      python.indexOf('# ---- Keying'),
    );
    const built = [...table.matchAll(/'([a-z_]+)': \(\d+,/g)].map((m) => m[1]);
    const validator = readFileSync('scripts/validate-assets.mjs', 'utf8');
    const start = validator.indexOf('const clips');
    const listed = [
      ...validator.slice(start, validator.indexOf('];', start)).matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1]);
    // The two figures that are not animals carry one clip of their own each, and the animals none of those.
    expect([...built].sort()).toEqual([...CLIPS, 'haunt', 'hop'].sort());
    for (const clip of Object.values(APPARITION_CLIP)) expect(built).toContain(clip);
    expect([...listed].sort()).toEqual([...CLIPS].sort());
  });

  it('picks the same gesture for the same member and moment, and only in states that idle about', () => {
    expect(fidgetFor('idle', 'member-1', 3)).toBe(fidgetFor('idle', 'member-1', 3));
    const seen = new Set(Array.from({ length: 40 }, (_, n) => fidgetFor('idle', 'member-1', n)));
    expect(seen.size).toBeGreaterThan(2); // varied, not one gesture on repeat
    for (const clip of seen) expect(CLIPS).toContain(clip);
    // Gestures never claim work, a decision or a message that is not happening.
    for (const claim of [
      'thinking',
      'scratch_head',
      'nod',
      'cheer',
      'typing',
      'reviewing',
    ] as const)
      expect(seen).not.toContain(claim);
    for (const busy of [
      'error',
      'offline',
      'unknown',
      'waiting_permission',
      'waiting_peer',
      'starting',
    ] as const)
      expect(fidgetFor(busy, 'member-1', 0)).toBeNull();
  });

  it('spaces gestures out by a few seconds, and members differently', () => {
    const waits = Array.from({ length: 30 }, (_, n) => fidgetDelayMs('member-1', n));
    for (const wait of waits) {
      expect(wait).toBeGreaterThanOrEqual(FIDGET_MIN_MS);
      expect(wait).toBeLessThan(FIDGET_MIN_MS + FIDGET_SPREAD_MS);
    }
    expect(fidgetDelayMs('member-2', 0)).not.toBe(fidgetDelayMs('member-1', 0));
  });

  it('cheers when work finishes, and greets only members at ease or at work', () => {
    expect(transitionClip('working', 'idle')).toBe('cheer');
    expect(transitionClip('reviewing', 'idle')).toBe('cheer');
    expect(transitionClip('waiting_permission', 'working')).toBe('nod');
    expect(transitionClip('idle', 'working')).toBeNull();
    expect(transitionClip(null, 'idle')).toBeNull();
    expect(transitionClip('error', 'idle')).toBeNull();
    expect(greets('idle') && greets('working') && greets('reviewing')).toBe(true);
    expect(greets('error') || greets('offline') || greets('waiting_permission')).toBe(false);
  });
});

it('replaces a member with a rabbit or a ghost by how its session is alive, and with nothing for the ordinary states', () => {
  expect(apparitionOf('dormant')).toBe('sleeping_rabbit');
  expect(apparitionOf('orphaned')).toBe('ghost');
  for (const state of ['active', 'idle', 'ended', 'unknown'] as const)
    expect(apparitionOf(state)).toBeNull();
  expect(APPARITION_MODEL).toEqual({ sleeping_rabbit: 'rabbit', ghost: 'ghost', zombie: 'zombie' });
  // Each model is a file the build makes: the animals are named for their species, the two figures for themselves.
  for (const model of ['ghost', 'zombie'])
    for (const lod of [0, 1, 2])
      expect(existsSync(`apps/web/public/assets/animals/${model}-lod${lod}.glb`), model).toBe(true);
});

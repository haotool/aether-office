import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activitySchema } from '../../packages/contracts/src/index.js';
import {
  APPARITION_CLIP,
  APPARITION_MODEL,
  BASE_CLIP,
  CLIPS,
  apparitionOf,
  greets,
  transitionClip,
} from '../../packages/office-scene/src/animals/animal-states.js';

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
    expect([...built].sort()).toEqual([...CLIPS, 'haunt', 'hop'].sort());
    for (const clip of Object.values(APPARITION_CLIP)) expect(built).toContain(clip);
    expect([...listed].sort()).toEqual([...CLIPS].sort());
  });

  it('cheers when work finishes, and greets only members at ease or at work', () => {
    expect(transitionClip('working', 'idle')).toBe('cheer');
    expect(transitionClip('reviewing', 'idle')).toBe('cheer');
    expect(transitionClip('waiting_permission', 'working')).toBe('nod');
    expect(transitionClip('idle', 'working')).toBeNull();
    expect(transitionClip(null, 'idle')).toBeNull();
    expect(transitionClip('error', 'idle')).toBeNull();
    expect(transitionClip('working', 'error')).toBe('shrug');
    expect(transitionClip('error', 'error')).toBeNull();
    expect(transitionClip(null, 'error')).toBeNull();
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
  for (const model of ['ghost', 'zombie'])
    for (const lod of [0, 1, 2])
      expect(existsSync(`apps/web/public/assets/animals/${model}-lod${lod}.glb`), model).toBe(true);
});

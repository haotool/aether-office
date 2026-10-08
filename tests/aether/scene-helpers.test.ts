import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import RAW from '../../packages/office-scene/src/desks/desk-seating.json';
import { context2d } from '../../packages/office-scene/src/core/canvas-2d.js';
import { pathLength } from '../../packages/office-scene/src/animals/departure.js';
import { assignSeats, seatAt } from '../../packages/office-scene/src/environment/layout.js';
import { SEATING, SLAB_TOP } from '../../packages/office-scene/src/core/seating.js';
import { setUniform } from '../../packages/office-scene/src/environment/uniforms.js';
import { summarizeFrames } from '../../packages/office-scene/src/perf/perf.js';

describe('the desk seating', () => {
  it('reads every size and position of the JSON as a point and finds the slab top', () => {
    expect(SEATING.slab.size).toEqual(RAW.slab.size);
    expect(SEATING.pedestal.at).toEqual(RAW.pedestal.at);
    expect(SEATING.screenY).toBe(RAW.screenY);
    expect(SLAB_TOP).toBe(RAW.slab.at[1]! + RAW.slab.size[1]! / 2);
  });
});

describe('small scene helpers', () => {
  it('sets a shader uniform and ignores one the material does not have', () => {
    const material = { uniforms: { time: { value: 0 } } } as never;
    setUniform(material, 'time', 4);
    setUniform(material, 'missing', 1);
    expect((material as { uniforms: { time: { value: number } } }).uniforms.time.value).toBe(4);
  });

  it('refuses a canvas that has no 2D context', () => {
    expect(() => context2d({ getContext: () => null } as unknown as HTMLCanvasElement)).toThrow(
      /Canvas 2D/,
    );
    const g = {} as CanvasRenderingContext2D;
    expect(context2d({ getContext: () => g } as unknown as HTMLCanvasElement)).toBe(g);
  });

  it('measures a path by its segments', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([{ x: 1, z: 1 }])).toBe(0);
    expect(
      pathLength([
        { x: 0, z: 0 },
        { x: 3, z: 4 },
        { x: 3, z: 10 },
      ]),
    ).toBe(11);
  });

  it('summarises a sample of frames and none for an empty one', () => {
    expect(summarizeFrames([])).toBeNull();
    expect(summarizeFrames([10, 20, 30])?.maxMs).toBe(30);
  });

  it('seats an agent where it asked, and elsewhere when that seat is not valid or is taken', () => {
    const agent = (id: string) => ({ id }) as unknown as Agent;
    const [a, b] = [agent('a'), agent('b')];
    const kept = assignSeats(new Map([['a', [0, 3]]]), [a!, b!]);
    expect(kept.get('a')).toEqual([0, 3]);
    expect(kept.get('b')).toEqual([0, 0]);
    const invalid = assignSeats(
      new Map([
        ['a', [9, 0]],
        ['b', [0, 0]],
      ]),
      [a!, b!],
    );
    expect(invalid.get('b')).toEqual([0, 0]);
    expect(invalid.get('a')).toEqual([0, 1]);
    expect(seatAt(0)).toEqual([-22, -6]);
  });
});

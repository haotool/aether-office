import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { renderHook } from './fixtures/mini-react.js';
const react = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return createRequire(`${process.cwd()}/packages/office-scene/package.json`).resolve('react');
});
vi.mock(react, () => import('./fixtures/mini-react.js'));
const { useDirector } = await import('../../packages/office-scene/src/core/use-director.js');
afterEach(() => vi.useRealTimers());

it('returns to employee closeups after sweeps and immediately replaces a departed subject', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const input = {
    agents: ['a', 'b'].map((id) => ({ id, activity: 'working' }) as Agent),
    seats: new Map(['a', 'b'].map((id, i) => [id, { x: i * 4, z: 4, floor: 0, rotation: 0 }])),
    pulses: [],
    attention: new Map(),
    intensity: new Map(),
  };
  const stage = { setFloor: vi.fn(), setExploded: vi.fn() };
  const hook = renderHook(useDirector, input, true, stage);
  expect(hook.current?.shot.subjects).toEqual(['a']);
  vi.advanceTimersByTime(50_000);
  expect(hook.current?.shot.kind).toBe('closeup');
  const id = hook.current!.shot.subjects[0];
  hook.rerender({ ...input, agents: input.agents.filter((a) => a.id !== id) }, true, stage);
  expect(hook.current?.shot.subjects).not.toContain(id);
  hook.unmount();
});

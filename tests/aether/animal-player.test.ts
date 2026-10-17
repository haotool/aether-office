import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { renderHook } from './fixtures/mini-react.js';

const paths = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  const resolve = createRequire(`${process.cwd()}/packages/office-scene/package.json`).resolve;
  return { react: resolve('react'), fiber: resolve('@react-three/fiber') };
});
vi.mock(paths.react, async () => ({
  ...(await import('./fixtures/mini-react.js')),
  useEffectEvent: (callback: unknown) => callback,
}));
vi.mock(paths.fiber, () => ({ useThree: () => () => undefined, useFrame: () => undefined }));
const resolve = createRequire(`${process.cwd()}/packages/office-scene/package.json`).resolve;
const { AnimationMixer, AnimationClip, Group, NumberKeyframeTrack } = (await import(
  resolve('three')
)) as typeof import('three');
const { useClipPlayer } = await import('../../packages/office-scene/src/animals/animal-hooks.js');

it('returns to the full seated pose after a one-shot, repeatedly without losing animation weight', () => {
  const root = new Group();
  const clips = ['seated_idle', 'cheer'].map(
    (name, i) =>
      new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[y]', [0, 1], [i, i])]),
  );
  const player = new AnimationMixer(root);
  const mixer = { current: player };
  const current = { current: null } as Parameters<typeof useClipPlayer>[0]['current'];
  const options: Parameters<typeof useClipPlayer>[0] = {
    model: { scene: root, clips, url: 'same-model' },
    url: 'same-model',
    clip: 'seated_idle',
    oneShot: null,
    apparition: undefined,
    override: undefined,
    reducedMotion: false,
    agentId: 'employee',
    mixer,
    current,
    onError: () => {
      throw new Error('missing animation');
    },
  };
  const hook = renderHook(useClipPlayer, options);
  for (let i = 0; i < 3; i++) {
    hook.rerender({ ...options, clip: 'cheer', oneShot: 'cheer' });
    player.update(1.1);
    hook.rerender(options);
    player.update(0.5);
    expect(root.position.y).toBeCloseTo(0);
    expect(current.current!.getEffectiveWeight()).toBeCloseTo(1);
    expect(current.current!.isRunning()).toBe(true);
  }
  hook.unmount();
});

import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

// A ceiling, not a target: whatever the GPU could do, the scene never draws more than the limit asks.
test('the 30 fps limit keeps the scene from drawing more than 30 frames a second', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { fps: '30' }, version: 0 }),
    ),
  );
  await signIn(page, '/?perf=1');
  await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 60000 });
  const { stats } = await page.evaluate(
    () => (window as unknown as { __aetherPerf: { stats: { medianFps: number } } }).__aetherPerf,
  );
  expect(stats.medianFps).toBeLessThanOrEqual(32);
});

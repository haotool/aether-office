import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { frames } from '../support/settled.js';
import type { PerfRig } from '../../packages/office-scene/src/perf/perf-rig.js';

for (const width of [1440, 820, 390]) {
  test(`scene hotfix: solid workstations and stable hover at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            locale: 'zh-TW',
            view: '3d',
            quality: 'balanced',
            autoCamera: false,
          },
          version: 0,
        }),
      ),
    );
    await signIn(page, '/?perf=1&squad=3&tools=900&look=1');
    await page.waitForFunction(
      () => !!(window as unknown as { __aetherPerfRig?: unknown }).__aetherPerfRig,
    );
    const models = () =>
      page.evaluate(() => {
        const rig = (window as unknown as { __aetherPerfRig: PerfRig }).__aetherPerfRig;
        const ids: string[] = [];
        rig.scene.traverse((node) => {
          if (node.type === 'SkinnedMesh') ids.push(node.uuid);
        });
        return ids.sort();
      });
    await expect.poll(async () => (await models()).length).toBeGreaterThanOrEqual(15);
    const before = await models();
    if (width === 1440) {
      const label = page.locator('.scene-label:visible').first();
      await label.hover();
      await frames(page, 20);
      expect(await models()).toEqual(before);
      await page.mouse.move(1, 1);
      await frames(page, 20);
      expect(await models()).toEqual(before);
    }
    const desks = await page.evaluate(() => {
      const rig = (window as unknown as { __aetherPerfRig: PerfRig }).__aetherPerfRig;
      const mesh = rig.scene.getObjectByName('squad-stools') as import('three').InstancedMesh;
      return {
        count: mesh.count,
        transparent: (mesh.material as import('three').Material).transparent,
      };
    });
    expect(desks).toEqual({ count: 3, transparent: false });
    for (const name of ['收合成側欄', '收合', '關閉分屏']) {
      const button = page.getByRole('button', { name, exact: true });
      if (await button.isVisible()) await button.click();
    }
    await frames(page, 120);
    await page.screenshot({ path: `evidence/scene-hotfix-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

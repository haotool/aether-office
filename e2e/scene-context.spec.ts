import { test, expect, type Page } from '@playwright/test';
import { signIn } from './support/sign-in.js';

// What the page does when the GPU takes the WebGL context away (iOS does it to a page in the background): a card with one
// tap to mount the scene again, or to use the list, instead of a silent switch to the 2D view.
const LOST = '裝置中斷了 3D 畫面。可以重新載入，或改用列表。';
const RELOAD = '重新載入場景';
const USE_LIST = '改用列表';

const loseContext = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
const contextAlive = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas && (canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    return !!gl && !gl.isContextLost();
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({
        state: { theme: 'dark', locale: 'zh-TW', quality: 'balanced', view: '3d' },
        version: 0,
      }),
    );
  });
  await signIn(page, '/?perf=30');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  // The scene has drawn its first report: its models are in, so a loss now is the loss of a running scene.
  await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 60000 });
});

test('a lost WebGL context shows a card, and one tap mounts the scene again with a live context', async ({
  page,
}) => {
  await loseContext(page);
  const card = page.getByRole('alert').filter({ hasText: LOST });
  await expect(card).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.office-2d')).toHaveCount(0); // the view was not forced to the list
  await page.getByRole('button', { name: RELOAD }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => contextAlive(page)).toBe(true);
  // ...and, once the new scene is drawing (its own probe, on the new canvas), it can lose it again and recover again.
  await page.waitForFunction(
    () =>
      (window as unknown as { __aetherPerfRig?: { gl: { domElement: Element } } }).__aetherPerfRig
        ?.gl.domElement === document.querySelector('canvas'),
    undefined,
    { timeout: 30000 },
  );
  // Thirty drawn frames (scene time): the new scene is running, which is what the second loss must find.
  await page.evaluate(() =>
    (
      window as unknown as { __aetherPerfRig: { sample: (n: number) => Promise<unknown> } }
    ).__aetherPerfRig.sample(30),
  );
  await loseContext(page);
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: RELOAD }).click();
  await expect.poll(() => contextAlive(page), { timeout: 30000 }).toBe(true);
});

test('the card also offers the list', async ({ page }) => {
  await loseContext(page);
  await page.getByRole('button', { name: USE_LIST }).click();
  await expect(page.locator('.office-2d')).toBeVisible();
});

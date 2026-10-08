import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

// The session panel's width: a drag handle on its left edge (mouse and keyboard), double-click to reset or fold to a
// rail, persistence, the 3D canvas following, and no overflow at the smallest and the largest width.
const MIN = 320;
const DEFAULT = 380; // a 1440px-wide window
const MAX = 720;

async function login(page: Page): Promise<string> {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  // The fixture repository is adopted as its own project, where its session lives.
  await expect(
    page.locator('.project-picker select option', { hasText: 'fixture-repo' }),
  ).toBeAttached({
    timeout: 20000,
  });
  const projects = (await (await page.request.get('/api/projects')).json()) as {
    id: string;
    name: string;
  }[];
  return projects.find((p) => p.name === 'fixture-repo')!.id;
}

const handle = (page: Page) => page.getByRole('separator', { name: '調整 session 面板寬度' });
const width = async (page: Page) =>
  Math.round((await page.locator('.session-panel').boundingBox())!.width);
// The office (3D canvas, or the 2D list where WebGL is not available) is what gives the panel its room.
const canvasWidth = async (page: Page) =>
  Math.round((await page.locator('.scene-shell').boundingBox())!.width);
/** Drawing-buffer pixels per CSS pixel of the 3D canvas (0 without one): unchanged after a resize means it was not left stretched or blurry. */
const sharpness = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.scene-shell canvas');
    return canvas ? canvas.width / canvas.clientWidth : 0;
  });
const value = async (page: Page) => Number(await handle(page).getAttribute('aria-valuenow'));

test.beforeEach(async ({ page }) => {
  test.setTimeout(100000); // the first WebGL scene of a cold server is slow to mount
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  await expect(handle(page)).toBeVisible();
  // The office has its width, and the fixture session is listed.
  await expect.poll(() => canvasWidth(page), { timeout: 45000 }).toBeGreaterThan(500);
  await expect(page.locator('.feed-row').first()).toBeVisible({ timeout: 20000 });
});

test('dragging the handle with the mouse widens the panel and the canvas follows live', async ({
  page,
}) => {
  expect(await width(page)).toBe(DEFAULT);
  const canvasBefore = await canvasWidth(page);
  const sharpBefore = await sharpness(page);
  const box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 4 });
  await page.mouse.move(x - 120, y, { steps: 4 });
  // Mid-drag: the app body carries the width, and React has not stored anything yet.
  await expect.poll(() => width(page)).toBe(DEFAULT + 120);
  await expect(page.locator('.app-body')).toHaveAttribute('data-resizing', '');
  await expect.poll(() => canvasWidth(page)).toBeLessThan(canvasBefore - 100);
  await page.mouse.up();
  await expect(page.locator('.app-body')).not.toHaveAttribute('data-resizing', '');
  expect(await width(page)).toBe(DEFAULT + 120);
  expect(await value(page)).toBe(DEFAULT + 120);
  // The canvas was re-measured, not stretched: the same pixels per CSS pixel as before.
  await expect.poll(async () => Math.abs((await sharpness(page)) - sharpBefore)).toBeLessThan(0.05);
  // Past the limits it stops at them.
  const edge = (await handle(page).boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(100, y, { steps: 6 });
  await page.mouse.up();
  expect(await width(page)).toBe(MAX);
});

test('Escape during a drag puts the width back', async ({ page }) => {
  const box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 90, y, { steps: 4 });
  await expect.poll(() => width(page)).toBe(DEFAULT + 90);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(() => width(page)).toBe(DEFAULT);
  expect(await value(page)).toBe(DEFAULT);
});

test('the keyboard resizes: arrows 16px, Shift 64px, Home and End the limits, Enter the default', async ({
  page,
}) => {
  await expect(handle(page)).toHaveAttribute('aria-orientation', 'vertical');
  await expect(handle(page)).toHaveAttribute('aria-valuemin', String(MIN));
  await expect(handle(page)).toHaveAttribute('aria-valuemax', String(MAX));
  await handle(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => width(page)).toBe(DEFAULT + 16);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => width(page)).toBe(DEFAULT + 16 + 64);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(page)).toBe(DEFAULT + 64);
  await page.keyboard.press('Home');
  await expect.poll(() => width(page)).toBe(MIN);
  await page.keyboard.press('End');
  await expect.poll(() => width(page)).toBe(MAX);
  await page.keyboard.press('Enter');
  await expect.poll(() => width(page)).toBe(DEFAULT);
});

test('double-click resets to the default, and at the default folds to a rail and back', async ({
  page,
}) => {
  await handle(page).focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => width(page)).toBe(DEFAULT + 64);
  await handle(page).dblclick();
  await expect.poll(() => width(page)).toBe(DEFAULT);
  await handle(page).dblclick();
  await expect(page.locator('.session-panel.rail')).toBeVisible();
  await expect.poll(() => width(page)).toBe(48);
  await expect(handle(page)).toHaveCount(0);
  await expect(page.locator('.panel-rail')).toBeVisible();
  const canvasRail = await canvasWidth(page);
  await page.getByRole('button', { name: '展開 session 面板' }).click();
  await expect.poll(() => width(page)).toBe(DEFAULT);
  expect(await canvasWidth(page)).toBeLessThan(canvasRail);
  // The header button folds it too.
  await page.getByRole('button', { name: '收合成側欄' }).click();
  await expect.poll(() => width(page)).toBe(48);
});

test('the width and the rail survive a reload', async ({ page }) => {
  await handle(page).focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => width(page)).toBe(DEFAULT + 128);
  await page.reload();
  await expect(handle(page)).toBeVisible();
  expect(await width(page)).toBe(DEFAULT + 128);
  await page.getByRole('button', { name: '收合成側欄' }).click();
  await page.reload();
  await expect(page.locator('.session-panel.rail')).toBeVisible();
  expect(await width(page)).toBe(48);
});

test('a shrinking window pulls a wide panel in and a growing one gives the width back', async ({
  page,
}) => {
  await handle(page).focus();
  await page.keyboard.press('End');
  await expect.poll(() => width(page)).toBe(MAX);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(() => width(page)).toBe(660); // 60% of 1100
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => width(page)).toBe(MAX);
});

test('no horizontal overflow at the smallest and the largest width, feed and conversation', async ({
  page,
}) => {
  for (const key of ['Home', 'End']) {
    await handle(page).focus();
    await page.keyboard.press(key);
    await expect.poll(() => width(page)).toBe(key === 'Home' ? MIN : MAX);
    for (const view of ['feed', 'conversation']) {
      if (view === 'conversation') await page.locator('.feed-row').first().click();
      const overflow = await page.evaluate(() => {
        const wide = (el: Element) => el.scrollWidth > el.clientWidth + 1;
        return {
          page: wide(document.documentElement),
          panel: wide(document.querySelector('.session-panel')!),
          scroll: [...document.querySelectorAll('.panel-scroll, .conv-scroll')].some(wide),
        };
      });
      expect(overflow, `${key} ${view}`).toEqual({ page: false, panel: false, scroll: false });
    }
    if (key === 'Home') await page.locator('.conversation .back').click();
  }
});

test('the handle, the rail and the panel pass axe in both themes', async ({ page }) => {
  const check = async () => {
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      const { violations } = await new AxeBuilder({ page })
        .include('.session-panel')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(violations, theme).toEqual([]);
    }
  };
  await check();
  await page.getByRole('button', { name: '收合成側欄' }).click();
  await check();
});

test('on a narrow window the panel lies over the office and has no handle', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 800 });
  await expect(handle(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '收合成側欄' })).toHaveCount(0);
});

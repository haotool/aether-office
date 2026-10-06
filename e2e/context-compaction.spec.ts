import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `?compact=1` gives every member a stand-in context that fills and is compacted every few seconds: the scene shows the
// compaction chip over the member and the provider's mark on the name tag, without overflowing its canvas.
async function login(page: Page, path: string) {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto(path);
  await page
    .getByLabel(/^(存取權杖|Access token)$/)
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: /^(進入辦公室|Enter office)$/ }).click();
}

const open = async (page: Page, locale: 'zh-TW' | 'en', reducedMotion = false) => {
  await page.addInitScript(
    ([language, reduced]) =>
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme: 'dark',
            locale: language,
            quality: 'balanced',
            view: '3d',
            reducedMotion: reduced,
            advanced: true,
          },
          version: 0,
        }),
      ),
    [locale, reducedMotion] as const,
  );
  await login(page, '/office?compact=1');
};

test('the compaction preview shows the chip in the scene, in both languages, without overflow', async ({
  page,
}) => {
  await open(page, 'zh-TW');
  const chip = page.locator('.compact-chip').first();
  await expect(chip).toBeAttached({ timeout: 20_000 });
  await expect(chip).toContainText('已壓縮 −64%');
  // a placed chip lies inside the scene's canvas, and the page does not scroll sideways
  const placed = page.locator('.compact-chip').filter({ visible: true }).first();
  await expect(placed).toBeVisible({ timeout: 20_000 });
  const inside = await page.evaluate(() => {
    const box = document.querySelector('.canvas-container')!.getBoundingClientRect();
    const chips = [...document.querySelectorAll<HTMLElement>('.compact-chip')].filter(
      (c) => getComputedStyle(c).visibility === 'visible',
    );
    return chips.every((c) => {
      const r = c.getBoundingClientRect();
      return (
        r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom
      );
    });
  });
  expect(inside).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('the chip is worded in English too, and survives reduced motion', async ({ page }) => {
  await open(page, 'en', true);
  await expect(page.locator('.compact-chip').first()).toContainText('compacted −64%', {
    timeout: 20_000,
  });
});

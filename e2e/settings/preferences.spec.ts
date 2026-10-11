import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { signIn } from '../support/sign-in.js';

const SHOTS = 'evidence/preferences';
mkdirSync(SHOTS, { recursive: true });

async function open(page: Page, theme: 'dark' | 'light', view: '2d' | '3d') {
  await page.addInitScript(
    ([t, v]) => {
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: { theme: t, locale: 'zh-TW', quality: 'low', view: v, advanced: true },
          version: 0,
        }),
      );
    },
    [theme, view],
  );
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/office');
  await page.waitForLoadState('networkidle');
}

/** Chromium's media feature that Playwright's emulateMedia does not name. */
async function reduceTransparency(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
}

for (const theme of ['dark', 'light'] as const)
  test(`forced colors (${theme}): controls keep a border and the focus ring is the system highlight`, async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page, theme, '2d');
    await expect
      .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
      .toBe(true);
    const primary = page.locator('.primary').first();
    await expect(primary).toBeVisible();
    const look = await primary.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderTopWidth, style: s.borderTopStyle, clip: s.clipPath };
    });
    expect(look.style).toBe('solid');
    expect(parseFloat(look.width)).toBeGreaterThanOrEqual(1);
    expect(look.clip).toBe('none');
    const ghost = page.locator('.icon-button').first();
    expect(await ghost.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: `${SHOTS}/forced-colors-${theme}.png` });
  });

test('forced colors: the 3D office keeps its HUD outlined', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await open(page, 'dark', '3d');
  const hud = page.locator('.building-panel, .floor-hud').first();
  await expect(hud).toBeVisible();
  expect(await hud.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  await page.screenshot({ path: `${SHOTS}/forced-colors-3d.png` });
});

for (const theme of ['dark', 'light'] as const)
  test(`more contrast (${theme}): visible hairlines, opaque glass, a 3px focus ring`, async ({
    page,
  }) => {
    await page.emulateMedia({ contrast: 'more' });
    await open(page, theme, '3d');
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        line: root.getPropertyValue('--line').trim(),
        glass: root.getPropertyValue('--glass').trim(),
        ring: root.getPropertyValue('--focus-ring').trim(),
        blur: getComputedStyle(document.querySelector('.topbar')!).backdropFilter,
      };
    });
    expect(tokens.glass).toBe('#0a141c');
    expect(tokens.line).toBe(theme === 'dark' ? '#7e97ab' : '#5c7385');
    expect(tokens.ring).toContain('3px');
    expect(tokens.blur).toBe('none');
    await page.screenshot({ path: `${SHOTS}/more-contrast-${theme}.png` });
  });

test('reduced transparency: opaque glass over the scene and no blur', async ({ page }) => {
  await reduceTransparency(page);
  await open(page, 'dark', '3d');
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches))
    .toBe(true);
  const look = await page.evaluate(() => ({
    glass: getComputedStyle(document.documentElement).getPropertyValue('--glass').trim(),
    blur: getComputedStyle(document.querySelector('.topbar')!).backdropFilter,
    panel: getComputedStyle(document.querySelector('.building-panel, .floor-hud')!).backgroundColor,
  }));
  expect(look.glass).toBe('#0a141c');
  expect(look.blur).toBe('none');
  expect(look.panel).not.toMatch(/rgba\(.*,\s*0?\.\d+\)$/);
  await page.screenshot({ path: `${SHOTS}/reduced-transparency.png` });
});

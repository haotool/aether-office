import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

/**
 * The 3D scene's own chrome (the toolbar over the canvas) is a compact HUD: its segments, buttons and select are all
 * --control-h-sm tall (32px with a mouse, 36px with a finger), the same as every other small control, never a one-off
 * height of their own. Measured on the office view at the three layouts of role-variance.spec.ts.
 */
const LAYOUTS = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false, height: 32 },
  tablet: { viewport: { width: 820, height: 1180 }, touch: true, height: 36 },
  phone: { viewport: { width: 390, height: 844 }, touch: true, height: 36 },
} as const;

for (const [layout, { viewport, touch, height }] of Object.entries(LAYOUTS))
  test(`${layout}: the scene toolbar controls are one height (${height}px)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch && viewport.width < 500,
    });
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({
            state: { theme: 'dark', locale: 'en', quality: 'low', view: '3d', advanced: true },
            version: 0,
          }),
        );
      } catch {
        // storage unavailable: the page still has to render
      }
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto('/office');
    await expect(page.locator('main')).toBeVisible();
    const controls = page.locator(
      '.scene-toolbar .segmented button, .scene-options > button, .scene-options select, .phone-top .segmented button',
    );
    await expect(controls.first()).toBeVisible();
    const heights = await controls.evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => Math.round(box.height)),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect([...new Set(heights)], `${layout} toolbar heights`).toEqual([height]);
    await context.close();
  });

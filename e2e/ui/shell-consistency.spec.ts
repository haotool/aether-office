import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

/**
 * The app shell and its pages (top bar, sidebar, Settings, KPI, local sessions) draw each control role at one height
 * from the control scale (--control-h-*, --bar-h) and never at a literal one. Same probe style as role-variance.spec.ts.
 */
const PREFERENCES = JSON.stringify({
  state: { theme: 'dark', locale: 'zh-TW', quality: 'low', view: '2d', advanced: true },
  version: 0,
});

async function open(page: Page, view: string) {
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  await page.goto(`/${view}?project=${projects[0]!.id}`);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** The distinct rounded heights of the visible elements matching `selector`. */
const heights = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const out = new Set<number>();
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) out.add(Math.round(box.height));
    }
    return [...out].sort((a, b) => a - b);
  }, selector);

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('aether-ui-preferences', value),
      PREFERENCES,
    );
    await signIn(page);
  });

  test('the top bar is --bar-h and its controls reach the 32px mouse floor', async ({ page }) => {
    await open(page, 'sessions');
    const bar = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height);
    expect(bar).toBe(56);
    const select = page.locator('.project-picker select');
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    const signOut = page.locator('.sidebar-bottom .text-button');
    expect((await signOut.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  });

  test('the sessions table actions are one control-h-sm height', async ({ page }) => {
    await open(page, 'sessions');
    expect(await heights(page, '.sessions-page .actions button')).toEqual([32]);
  });

  test('settings: switch and segmented use the shared classes and one height', async ({ page }) => {
    await open(page, 'settings');
    expect(await heights(page, '.u-switch')).toEqual([32]);
    expect(await heights(page, '.sseg.u-segmented button')).toEqual([32]);
  });

  test('kpi: office chips are one height and explanatory text has one gap', async ({ page }) => {
    await open(page, 'office');
    await page.locator('.kpi-cell, .kpi-open').first().click();
    await expect(page.locator('.kpi-dialog')).toBeVisible();
    expect(await heights(page, '.kpi-offices .u-chip')).toEqual([32]);
    const gaps = await page
      .locator('.kpi-empty, .kpi-note')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).marginTop).filter((margin) => margin !== '0px'),
      );
    expect(new Set(gaps).size).toBeLessThanOrEqual(1);
  });

  test('the nav link keeps the focus ring when it is the active page', async ({ page }) => {
    await open(page, 'sessions');
    const onActive = () => page.evaluate(() => document.activeElement?.matches('.nav-link.active'));
    for (let i = 0; i < 60 && !(await onActive()); i++) await page.keyboard.press('Tab');
    expect(await onActive()).toBe(true);
    const ring = await page
      .locator('.nav-link.active')
      .evaluate((el) => getComputedStyle(el).outlineWidth);
    expect(ring).toBe('2px');
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a long project name ends in an ellipsis and keeps its tooltip', async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('aether-ui-preferences', value),
      PREFERENCES,
    );
    await signIn(page);
    await open(page, 'sessions');
    const select = page.locator('.project-picker select');
    expect(await select.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
    expect(await select.getAttribute('title')).toBeTruthy();
  });
});

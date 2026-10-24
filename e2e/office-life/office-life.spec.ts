import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

type Seed = { theme?: 'dark' | 'light'; version?: number };

async function open(page: Page, path: string, seed: Seed = {}) {
  const { theme = 'dark', version = 0 } = seed;
  await page.addInitScript(
    ([state, v]) => {
      // Seeded once per tab: a reload keeps what the page itself saved since.
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.setItem('aether-ui-preferences', JSON.stringify({ state, version: v }));
    },
    [
      { theme, locale: 'en', view: '3d', autoCamera: false, panelCollapsed: true },
      version,
    ] as const,
  );
  await signIn(page);
  await page.goto(path);
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}'));

test.describe('settings', () => {
  test('Office → Animations: Calm mode and relation effects persist', async ({ page }) => {
    await open(page, '/settings/office');
    const calm = page.getByRole('switch', { name: 'Calm mode', exact: true });
    const relation = page.getByRole('switch', { name: 'Relation effects', exact: true });
    await expect(calm).not.toBeChecked();
    await expect(relation).toBeChecked();
    await calm.check();
    expect((await stored(page)).state.life.calm).toBe(true);
    await calm.uncheck();
    await relation.uncheck();
    expect((await stored(page)).state.life).toEqual({ calm: false, relation: false });
    await page.reload();
    await expect(relation).not.toBeChecked();
  });

  test('the phone drawer has a Calm mode switch that is the same setting', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await open(page, '/office');
    await page.locator('.mobile-menu').tap();
    const calm = page
      .locator('.sidebar.open .quick-prefs')
      .getByRole('button', { name: 'Calm mode' });
    await expect(calm).toHaveAttribute('aria-pressed', 'false');
    await calm.tap();
    await expect(calm).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).state.life.calm).toBe(true);
    await context.close();
  });

  test('upgrades stored preferences of version 0, keeping them and adding the defaults', async ({
    page,
  }) => {
    await open(page, '/settings/office', { version: 0 });
    const after = await stored(page);
    expect(after.version).toBe(1);
    expect(after.state.life.calm).toBe(false);
    expect(after.state.life.relation).toBe(true);
    expect(after.state.locale).toBe('en');
  });

  test('starts Calm mode on when the system asks for reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto('/settings/office');
    await expect(page.getByRole('switch', { name: /Calm mode|平靜模式/ })).toBeChecked();
    await context.close();
  });

  for (const theme of ['dark', 'light'] as const)
    test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
      await open(page, '/settings/office', { theme });
      await expect(page.getByRole('switch', { name: 'Calm mode', exact: true })).toBeVisible();
      const results = await new AxeBuilder({ page }).include('#s-office').analyze();
      expect(results.violations).toEqual([]);
    });

  test('is findable by search', async ({ page }) => {
    await open(page, '/settings');
    await page.getByRole('searchbox').fill('calm');
    await expect(page.getByRole('switch', { name: 'Calm mode', exact: true })).toBeVisible();
  });
});

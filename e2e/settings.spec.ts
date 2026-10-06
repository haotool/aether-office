import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function signIn(page: Page) {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await expect(page.locator('main')).toBeVisible();
}

const nav = (page: Page) => page.getByRole('navigation', { name: '設定分類' });
const prefs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}').state);

test.describe('on a desktop', () => {
  test('the navigation scrolls to a group, sets the address and follows the scroll', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/settings');
    await nav(page).getByRole('link', { name: '關於' }).click();
    await expect(page).toHaveURL(/\/settings\/about/);
    await expect(page.locator('#s-about')).toBeInViewport();
    await expect(nav(page).getByRole('link', { name: '關於' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await page.goBack(); // the address history works
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('/settings/<group> and #<group> open the group', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/data');
    await expect(page.locator('#s-data')).toBeInViewport();
    await page.goto('/settings#models');
    await expect(page.locator('#s-models')).toBeInViewport();
    await page.goto('/settings/nonsense'); // an unknown name is the home, not an error
    await expect(page.getByRole('heading', { name: '設定', level: 1 })).toBeVisible();
  });

  test('the navigation is reachable and operable by keyboard', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings');
    await nav(page).getByRole('link', { name: '連線' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\/connections/);
    await expect(page.locator('#s-connections')).toBeInViewport();
  });

  test('search narrows to the matching rows in either language, marks the words, and / and Escape work', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/settings');
    await expect(page.getByRole('searchbox', { name: '搜尋設定' })).toBeVisible();
    await page.keyboard.press('/');
    const box = page.getByRole('searchbox', { name: '搜尋設定' });
    await expect(box).toBeFocused();
    await box.fill('theme'); // English words find the Chinese row
    await expect(page.getByRole('heading', { name: '介面外觀', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '介面語言', level: 3 })).toHaveCount(0);
    await box.fill('動態');
    await expect(page.locator('mark').first()).toHaveText('動態');
    await box.fill('qqqqqq');
    await expect(page.getByText('沒有符合的設定')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(box).toHaveValue('');
    await expect(page.getByRole('heading', { name: '介面語言', level: 3 })).toBeVisible();
  });

  test('every switch and choice is kept across a reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings');
    await page.getByRole('switch', { name: /減少動態/ }).setChecked(true);
    await page.getByRole('switch', { name: '自動運鏡' }).setChecked(false);
    await page.getByRole('switch', { name: 'Git 豆莖' }).setChecked(true);
    await page.getByRole('radio', { name: '淺色' }).click();
    await page.getByRole('radio', { name: '高', exact: true }).click();
    await page.getByRole('radio', { name: '2D 列表' }).click();
    await page.getByRole('combobox', { name: '介面語言' }).selectOption('en');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Reduce motion' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Auto camera' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'High' })).toBeChecked();
    expect(await prefs(page)).toMatchObject({
      theme: 'light',
      quality: 'high',
      view: '2d',
      locale: 'en',
      reducedMotion: true,
      autoCamera: false,
      beanstalk: true,
    });
  });

  test('the theme can follow the system, and an old stored value still works', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({ state: { theme: 'light' }, version: 0 }),
      ),
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.goto('/settings');
    await page.getByRole('radio', { name: '跟隨系統' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the Advanced switch can be taken back from its notice', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings');
    const advanced = page.getByRole('switch', { name: '進階功能' });
    await advanced.setChecked(false);
    await advanced.setChecked(true);
    await page
      .getByRole('status')
      .filter({ hasText: '進階功能' })
      .getByRole('button', { name: '復原' })
      .click();
    await expect(advanced).not.toBeChecked();
  });

  test('a command can be copied and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);
    await page.goto('/settings/models');
    await page.getByRole('button', { name: /pnpm run doctor/ }).click();
    await expect(page.getByText('已複製').first()).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm run doctor');
  });

  test('a viewer sees the rows, with the owner-only ones locked and saying why', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/api/session', (route) =>
      route.fulfill({
        json: { actor: { id: 'v', role: 'viewer', projectIds: [] }, mode: 'live' },
      }),
    );
    await page.route('**/api/remote-approvals', (route) =>
      route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } }),
    );
    await page.goto('/settings/notifications');
    const remote = page.getByRole('switch', { name: /在這裡回答 Claude Code/ });
    await expect(remote).toBeDisabled();
    await expect(page.getByText('僅擁有者').first()).toBeVisible();
    await page.goto('/settings/connections');
    await expect(page.getByText('僅操作者')).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const)
    test(`${theme} theme: the page has no accessibility violations`, async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({ state: { theme: value, advanced: true, view: '2d' }, version: 0 }),
        );
      }, theme);
      await signIn(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the groups are a list; a group opens its own page and Back returns to the list', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/settings');
    const row = nav(page).getByRole('link', { name: /^通知與核准/ });
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await row.tap();
    await expect(page).toHaveURL(/\/settings\/notifications/);
    await expect(page.getByRole('heading', { name: '通知與核准', level: 1 })).toBeVisible();
    await expect(page.getByRole('switch', { name: '通知' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '介面語言' })).toHaveCount(0); // only this group
    await page.locator('.back-link').tap();
    await expect(page).toHaveURL(/\/settings(\?|$)/);
    await expect(nav(page)).toBeVisible();
  });

  test('a deep link opens the group, and search lists matching rows across groups', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/settings/about');
    await expect(page.getByRole('heading', { name: '關於', level: 1 })).toBeVisible();
    await page.goto('/settings');
    await page.getByRole('searchbox', { name: '搜尋設定' }).fill('https');
    await expect(page.getByRole('heading', { name: '這個頁面的位址與安全性' })).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
  });

  test('a phone on its side keeps the bar out of the way and does not scroll sideways', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/settings/models');
    const sticky = await page
      .locator('.settings-bar')
      .evaluate((el) => getComputedStyle(el).position);
    expect(sticky).toBe('static');
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(wide).toBeLessThanOrEqual(1);
  });

  for (const theme of ['dark', 'light'] as const)
    test(`${theme} theme: the list and a group have no accessibility violations`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({ state: { theme: value, advanced: true, view: '2d' }, version: 0 }),
        );
      }, theme);
      await signIn(page);
      for (const url of ['/settings', '/settings/models', '/settings/advanced']) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        const result = await new AxeBuilder({ page }).analyze();
        expect(result.violations.map((v) => `${url} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      }
    });
});

test.describe('on the smallest phone', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

  test('no group scrolls the page sideways, long commands scroll inside their own box', async ({
    page,
  }) => {
    await signIn(page);
    for (const id of [
      'general',
      'notifications',
      'connections',
      'models',
      'office',
      'advanced',
      'data',
      'about',
    ]) {
      await page.goto(`/settings/${id}`);
      await page.waitForLoadState('networkidle');
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(wide, id).toBeLessThanOrEqual(1);
    }
    await page.goto('/settings/models');
    const code = page.locator('.copycmd code').last();
    expect(await code.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  });
});

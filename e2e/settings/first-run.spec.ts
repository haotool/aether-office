import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from '../support/sign-in.js';

const PREFS = 'aether-ui-preferences';
const READY = 'main';

async function noProjects(page: Page) {
  await page.route('**/api/projects', (route) => route.fulfill({ json: [] }));
}

async function emptyOffice(page: Page) {
  await page.route(/\/api\/projects\/[^/]+\/snapshot$/, async (route) => {
    const response = await route.fetch();
    const snapshot = (await response.json()) as { agents: unknown[] };
    await route.fulfill({ response, json: { ...snapshot, agents: [] } });
  });
  await page.route('**/api/local-sessions', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as object;
    await route.fulfill({ response, json: { ...body, enabled: true, sessions: [] } });
  });
}

const marker = (label: Locator) => label.evaluate((el) => getComputedStyle(el, '::after').content);

test.describe('language follows the browser on a first visit', () => {
  test.describe('an English browser', () => {
    test.use({ locale: 'en-US' });

    test('gets an English login page and document, and keeps the choice', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByLabel('Access token')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await signIn(page);
      await expect(page.getByRole('link', { name: /^Office/ })).toBeVisible();
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as { state?: { locale?: string } },
        PREFS,
      );
      expect(stored.state?.locale).toBe('en');
    });

    test('never overrides a saved preference', async ({ page }) => {
      await page.addInitScript((key) => {
        const saved = JSON.parse(localStorage.getItem(key) ?? '{"version":0}');
        saved.state = { ...saved.state, locale: saved.state?.locale ?? 'zh-TW' };
        localStorage.setItem(key, JSON.stringify(saved));
      }, PREFS);
      await page.goto('/');
      await expect(page.getByLabel('存取權杖')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
    });
  });

  test.describe('a Traditional Chinese browser', () => {
    test.use({ locale: 'zh-TW' });

    test('gets a Chinese login page and document', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByLabel('存取權杖')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
    });
  });
});

test.describe('nothing is running yet', () => {
  test.use({ locale: 'en-US' });

  test('a first-run panel says what happens, with the commands to copy and a secondary Create project', async ({
    page,
  }) => {
    await noProjects(page);
    await signIn(page);
    const panel = page.getByRole('region', { name: 'Nothing is running yet' });
    await expect(panel).toBeVisible();
    for (const command of ['claude', 'codex', 'pnpm run doctor'])
      await expect(
        panel.getByRole('button', { name: `Copy: ${command}`, exact: true }),
      ).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Copy: pnpm hooks install/ })).toBeVisible();
    const create = panel.getByRole('button', { name: 'Create a project by hand' });
    await expect(create).toHaveClass(/secondary/);
    await expect(create).not.toHaveClass(/primary/);
    await expect(page.getByRole('combobox', { name: 'Project' })).toHaveCount(0);
  });

  test('a project with no session shows it in the office view and the list, not an empty building', async ({
    page,
  }) => {
    await emptyOffice(page);
    await signIn(page);
    await expect(page.getByRole('region', { name: 'Nothing is running yet' })).toBeVisible();
    await page.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ state: { view: '2d' }, version: 0 })),
      PREFS,
    );
    await page.reload();
    await expect(page.getByRole('region', { name: 'Nothing is running yet' })).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const)
    for (const width of [390, 1440])
      test(`${theme} theme at ${width}px: fits the screen and has no accessibility violations`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(
          ([key, value]) =>
            localStorage.setItem(key!, JSON.stringify({ state: { theme: value }, version: 0 })),
          [PREFS, theme],
        );
        await noProjects(page);
        await signIn(page);
        await expect(page.getByRole('region', { name: 'Nothing is running yet' })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).include('.first-run').analyze();
        expect(results.violations.map((v) => v.id)).toEqual([]);
      });
});

test.describe('the Sessions page without rows', () => {
  test.use({ locale: 'en-US' });

  test('says there are no sessions yet, instead of a bare filter bar', async ({ page }) => {
    await emptyOffice(page);
    await signIn(page, '/sessions');
    await expect(page.getByRole('heading', { name: 'No local sessions yet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show all sessions' })).toHaveCount(0);
    await expect(page.locator('.sessions-page table')).toHaveCount(0);
  });

  test('says what the filters hide, and one tap shows every session', async ({ page }) => {
    await signIn(page, '/sessions');
    await expect(page.locator('.sessions-page table')).toBeVisible();
    await page.getByPlaceholder(/^Search title/).fill('no session is called this');
    await expect(
      page.getByRole('heading', { name: 'No session matches these filters' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show all sessions' }).click();
    await expect(page.locator('.sessions-page table')).toBeVisible();
    await expect(page.getByPlaceholder(/^Search title/)).toHaveValue('');
  });
});

test.describe('an address that names a project that is not there', () => {
  test('falls back to the first project with a short notice and no Retry', async ({ page }) => {
    await signIn(page);
    await page.goto('/office?project=bogus');
    await expect(page.getByRole('status').filter({ hasText: '找不到那個專案' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重試' })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('PROJECT_NOT_FOUND');
    await expect(page).not.toHaveURL(/project=bogus/);

    await page.goto('/tasks?project=00000000-0000-4000-8000-000000000000');
    await expect(
      page.getByRole('heading', { name: '工作', level: 1 }).or(page.locator('h1')),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText('PROJECT_NOT_FOUND');
  });
});

test.describe('the Approvals page', () => {
  const request = {
    id: 'req-1',
    sessionKey: 'claude:abc',
    tool: 'Bash',
    summary: 'npm test',
    preview: null,
    needsReview: false,
    sessionRules: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 600_000,
    state: 'pending',
    decidedAt: null,
  };
  const live = async (page: Page, enabled: boolean, requests: object[]) => {
    await signIn(page);
    await page.route('**/api/session', (route) =>
      route.fulfill({
        json: { actor: { id: 'o', role: 'owner', projectIds: ['*'] }, mode: 'live' },
      }),
    );
    await page.route('**/api/remote-approvals', (route) =>
      route.fulfill({ json: { enabled, channel: 'ok' } }),
    );
    await page.route('**/api/permission-requests', (route) =>
      route.fulfill({ json: { requests } }),
    );
  };

  test.use({ locale: 'en-US' });

  test('lists a pending permission request instead of saying there is none', async ({ page }) => {
    await live(page, true, [request]);
    await page.goto('/approvals');
    await expect(page.getByRole('region', { name: 'Permission request' })).toContainText(
      'npm test',
    );
    await expect(page.getByText('No pending tool permissions')).toHaveCount(0);
  });

  test('the empty copy depends on whether Remote approvals is on', async ({ page }) => {
    await live(page, true, []);
    await page.goto('/approvals');
    await expect(page.getByText(/Remote approvals is on/)).toBeVisible();
    await expect(page.getByText(/turn on Remote approvals in Settings/)).toHaveCount(0);
  });

  test('says how to turn it on when it is off', async ({ page }) => {
    await live(page, false, []);
    await page.goto('/approvals');
    await expect(page.getByText(/turn on Remote approvals in Settings/)).toBeVisible();
  });
});

test.describe('the tab title names the page, in the language of the interface', () => {
  test('Chinese', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveTitle('辦公室 · AETHER OFFICE');
    await page.getByRole('link', { name: /^工具批准/ }).click();
    await expect(page).toHaveTitle('工具批准 · AETHER OFFICE');
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('names the page', async ({ page }) => {
      await signIn(page);
      await page.goto('/approvals');
      await expect(page).toHaveTitle('Approvals · AETHER OFFICE');
      await page.goto('/settings');
      await expect(page).toHaveTitle('Settings · AETHER OFFICE');
    });
  });
});

test.describe('the keyboard skeleton', () => {
  test('the first Tab is a skip link that lands on the main landmark', async ({ page }) => {
    await signIn(page);
    await page.goto('/office');
    await expect(page.locator(READY)).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '跳到主要內容' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
  });

  test('the page has a navigation, a main and a complementary landmark', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('complementary')).toBeVisible();
  });

  test('the 3D canvas is an image with a name and a sentence that says what is in it', async ({
    page,
  }) => {
    await signIn(page);
    const canvas = page.locator('main canvas').first();
    await expect(canvas).toHaveAttribute('role', 'img');
    await expect(canvas).toHaveAttribute('aria-label', '3D 辦公室');
    const describedBy = await canvas.getAttribute('aria-describedby');
    const summary = page.locator(`[id="${describedBy}"]`);
    await expect(summary).toHaveAttribute('aria-live', 'polite');
    await expect(summary).toHaveText(/層樓共 \d+ 個角色/);
  });
});

test.describe('an address that is no page', () => {
  test('says so, in both languages, and links home', async ({ page }) => {
    await signIn(page);
    await page.goto('/nonexistent-page');
    await expect(page.getByText('找不到這個頁面')).toBeVisible();
    await expect(page).toHaveTitle('找不到這個頁面 · AETHER OFFICE');
    await page.getByRole('link', { name: '回到辦公室' }).click();
    await expect(page).toHaveURL(/\/office/);
    await page.goto('/settings/notifications');
    await expect(page.getByText('找不到這個頁面')).toHaveCount(0);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('is worded in English', async ({ page }) => {
      await signIn(page);
      await page.goto('/nonexistent-page');
      await expect(page.getByText('Page not found')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to the office' })).toBeVisible();
    });
  });
});

test.describe('forms say what is missing in the interface language', () => {
  test.use({ locale: 'en-US' });

  test('Create task marks required fields and shows inline errors instead of the browser bubble', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/^Task title/)).toBeVisible();
    expect(await marker(dialog.locator('label', { hasText: 'Task title' }))).toContain('*');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.getByText('This field is required.')).toHaveCount(2);
    await expect(dialog.getByLabel(/^Task title/)).toBeFocused();
    await expect(dialog.getByLabel(/^Task title/)).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByLabel('Dependencies')).toBeVisible();
    await expect(dialog.getByText(/Ctrl\/Cmd-click/)).toBeVisible();
  });

  test('Propose knowledge marks Source as required', async ({ page }) => {
    await signIn(page);
    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'Propose knowledge' }).first().click();
    const dialog = page.getByRole('dialog');
    expect(await marker(dialog.locator('label', { hasText: 'Source' }))).toContain('*');
    await dialog
      .getByRole('button', { name: 'Create', exact: true })
      .or(dialog.locator('form button.primary'))
      .click();
    await expect(dialog.getByText('This field is required.').first()).toBeVisible();
  });
});

test('the layout editor says it is experimental and leaves the scene in view', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: '編輯配置（實驗性）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const [box, scene] = await Promise.all([
    dialog.boundingBox(),
    page.locator('.scene-shell').boundingBox(),
  ]);
  const overlap = Math.max(
    0,
    Math.min(box!.x + box!.width, scene!.x + scene!.width) - Math.max(box!.x, scene!.x),
  );
  expect(overlap).toBeLessThan(scene!.width / 2);
});

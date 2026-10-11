import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
}

test('the selected agent lives in the URL, so reload and deep links restore it', async ({
  page,
}) => {
  await login(page);
  await page.locator('.team-chip', { hasText: 'Mika' }).click();
  await expect(page).toHaveURL(/agent=/);
  const panel = page.locator('.session-panel');
  await expect(panel).toContainText('Mika');
  await page.reload();
  await expect(page.locator('.session-panel')).toContainText('Mika');
  const url = page.url();
  await page.goto('/tasks');
  await page.goto(url);
  await expect(page.locator('.session-panel')).toContainText('Mika');
});

test('everything the 3D scene shows has an equivalent in the DOM that works by keyboard', async ({
  page,
}) => {
  await login(page);
  const agents = ((await (await page.request.get('/api/projects')).json()) as { id: string }[])[0]!
    .id;
  const snapshot = (await (await page.request.get(`/api/projects/${agents}/snapshot`)).json()) as {
    agents: { name: string }[];
  };
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.team-chip')).toHaveCount(snapshot.agents.length);
  expect(await page.locator('button.scene-label').count()).toBeGreaterThanOrEqual(
    snapshot.agents.length,
  );
  await page.locator('.team-chip', { hasText: 'Nova' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.session-panel')).toContainText('Nova');
});

test('state is never carried by colour alone: every badge has visible text', async ({ page }) => {
  await login(page);
  for (const path of ['office', 'agents', 'tasks', 'machines', 'history']) {
    await page
      .getByRole('link', {
        name: new RegExp(
          `^${{ office: '辦公室', agents: '團隊成員', tasks: '任務', machines: '執行主機', history: '歷史紀錄' }[path]}`,
        ),
      })
      .click();
    await page.waitForLoadState('networkidle');
    const empty = await page
      .locator('.badge')
      .evaluateAll((nodes) => nodes.filter((n) => !(n as HTMLElement).innerText.trim()).length);
    expect(empty, path).toBe(0);
  }
});

test('Ctrl+K opens quick open, and typing then Enter jumps to the match', async ({ page }) => {
  await login(page);
  await page.keyboard.press('Control+k');
  const input = page.getByRole('searchbox', { name: '快速開啟' });
  await expect(input).toBeFocused();
  await input.fill('approvals');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/approvals/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

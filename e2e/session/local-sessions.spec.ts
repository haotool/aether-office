import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { settled } from '../support/settled.js';

const REPO = 'fixture-repo';
test('local sessions are auto-discovered and shown as observe-only 3D agents', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const picker = page.locator('.project-picker select');
  await expect(picker.locator('option', { hasText: REPO })).toBeAttached({ timeout: 15000 });
  const label = page.locator('.scene-label', { hasText: REPO });
  await expect(label).toHaveCount(0);
  await picker.selectOption({ label: REPO });
  await expect(label).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.scene-label', { hasText: 'Explore' })).toBeAttached();
  await expect(page.locator('canvas')).toBeVisible();
  await label.hover();
  await settled(label);
  await label.click();
  await expect(label).toHaveClass(/selected/);
  await expect(page.getByText('OBSERVE · claude')).toBeVisible();
  await page.locator('.session-details summary').click();
  await expect(page.getByText('uncommitted', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-local-sessions.png' });
  await page.getByRole('button', { name: '2D 列表' }).click();
  await expect(page.locator('.agent-card', { hasText: REPO }).first()).toBeVisible();
  await expect(page.locator('.team-chip', { hasText: REPO }).first()).toBeVisible();
  await page.getByRole('button', { name: '3D 空間' }).click();
  expect(errors).toEqual([]);
});

test('show in office opens the project and brings the desk into view', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('.project-picker select option', { hasText: REPO })).toBeAttached({
    timeout: 15000,
  });
  await page.goto('/sessions');
  await page.getByRole('button', { name: '在辦公室查看' }).first().click();
  await expect(page).toHaveURL(/\/office\?project=[^&]+&agent=local%3Aclaude%3Ae2e-session$/, {
    timeout: 15000,
  });
  await expect(page.locator('.scene-label.selected')).toBeVisible({ timeout: 15000 });
});

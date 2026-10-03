import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
test('local sessions are auto-discovered and shown as observe-only 3D agents', async ({ page }) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  // The repository is adopted as its own project; its sessions appear there and not in other projects.
  const picker = page.locator('.project-picker select');
  await expect(picker.locator('option', { hasText: 'fixture-repo' })).toBeAttached({
    timeout: 15000,
  });
  const label = page.locator('.scene-label', { hasText: 'fixture-repo' });
  await expect(label).toHaveCount(0);
  await picker.selectOption({ label: 'fixture-repo' });
  await expect(label).toBeVisible({ timeout: 15000 });
  // Labels are projected from 3D and hidden when off-camera, so assert the subagent character exists.
  await expect(page.locator('.scene-label', { hasText: 'Explore' })).toBeAttached();
  await expect(page.locator('canvas')).toBeVisible();
  await label.click();
  await expect(page.getByText('OBSERVE · claude')).toBeVisible();
  await expect(page.getByText('uncommitted', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-local-sessions.png' });
  expect(errors).toEqual([]);
});

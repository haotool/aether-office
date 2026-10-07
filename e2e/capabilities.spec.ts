import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('the agents page lists the verified provider capability matrix', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: '團隊成員', exact: true }).click();
  await expect(page.getByRole('heading', { name: '提供者能力矩陣' })).toBeVisible();
  const row = page.getByRole('row', { name: /messageInjection/ });
  await expect(row).toContainText('none');
  const subagents = page.getByRole('row', { name: /^subagents/ });
  await expect(subagents).not.toContainText('支援 支援');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

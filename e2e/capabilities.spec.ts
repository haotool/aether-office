import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('the agents page lists the verified provider capability matrix', async ({ page }) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
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

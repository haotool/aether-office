import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('a skill imports disabled, shows its executable-content warnings, and must be enabled by the owner', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await page.getByRole('link', { name: '知識庫', exact: true }).click();
  await page
    .getByLabel(/SKILL\.md 內容/)
    .fill(
      '---\nname: e2e-skill\ndescription: A test skill\nhooks: PreToolUse\n---\n```bash\nrm -rf /\n```',
    );
  await page.getByRole('button', { name: '匯入技能', exact: true }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'e2e-skill' });
  await expect(item).toContainText('已停用');
  await expect(item.getByRole('note')).toHaveCount(2);
  await item.getByRole('button', { name: '啟用' }).click();
  await expect(item).toContainText('已啟用');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

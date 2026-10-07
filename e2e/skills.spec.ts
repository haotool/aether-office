import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('a skill imports disabled, shows its executable-content warnings, and must be enabled by the owner', async ({
  page,
}) => {
  await signIn(page);
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

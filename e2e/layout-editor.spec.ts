import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the layout editor adds, moves, undoes, redoes and saves, and the saved layout survives a reload', async ({
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
  const projectId = (
    (await (await page.request.get('/api/projects')).json()) as { id: string }[]
  )[0]!.id;
  const saved = async () => {
    const snapshot = (await (
      await page.request.get(`/api/projects/${projectId}/snapshot`)
    ).json()) as {
      layout: { version: number; data: { objects: { id: string; x: number }[] } } | null;
    };
    return snapshot.layout;
  };
  const before = (await saved())?.data.objects.length ?? 0;

  await page.getByRole('button', { name: '編輯配置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const options = dialog.locator('select').first().locator('option');
  await options.first().waitFor({ state: 'attached' }); // the object list renders after the dialog opens
  const initial = await options.count();
  await dialog
    .getByRole('button', { name: /^新增 / })
    .first()
    .click();
  await expect(options).toHaveCount(initial + 1);

  const x = dialog.getByLabel('X (m)', { exact: true });
  await expect(x).toHaveValue('5');
  await x.fill('6.5');
  await expect(x).toHaveValue('6.5');
  await dialog.getByRole('button', { name: '復原', exact: true }).click();
  await expect(x).toHaveValue('5'); // undo restores the previous value
  await dialog.getByRole('button', { name: '重做', exact: true }).click();
  await expect(x).toHaveValue('6.5'); // redo re-applies it

  await dialog.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await saved())?.data.objects.length)
    .toBe(before === 0 ? initial + 1 : before + 1);
  await page.reload();
  expect((await saved())?.data.objects.some((o) => o.x === 6.5)).toBe(true); // persisted on the server, not just in the page
});

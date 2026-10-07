import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

test('the layout editor adds, moves, undoes, redoes and saves, and the saved layout survives a reload', async ({
  page,
}) => {
  await signIn(page);
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

  await page.getByRole('button', { name: '編輯配置（實驗性）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const options = dialog.getByLabel('物件', { exact: true }).locator('option');
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
    // The editor saves the whole building (every floor); the list shows one floor, so only growth is comparable.
    .toBeGreaterThan(before === 0 ? initial : before);
  await page.reload();
  expect((await saved())?.data.objects.some((o) => o.x === 6.5)).toBe(true); // persisted on the server, not just in the page
});

test('the layout editor adds a squad zone beside a desk, saves it as layout version 2 and reloads it', async ({
  page,
}) => {
  await signIn(page);
  const projectId = (
    (await (await page.request.get('/api/projects')).json()) as { id: string }[]
  )[0]!.id;
  const saved = async () => {
    const snapshot = (await (
      await page.request.get(`/api/projects/${projectId}/snapshot`)
    ).json()) as {
      layout: {
        data: {
          schemaVersion: number;
          objects: { type: string; anchor?: string; seats?: number }[];
        };
      } | null;
    };
    return snapshot.layout?.data;
  };

  await page.getByRole('button', { name: '編輯配置（實驗性）', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const options = dialog.getByLabel('物件', { exact: true }).locator('option');
  await options.first().waitFor({ state: 'attached' });
  const initial = await options.count();
  // The first object of the ground floor is a desk: its squad zone goes beside it, in the free floor space.
  await dialog.getByRole('button', { name: '新增小隊區域', exact: true }).click();
  await expect(options).toHaveCount(initial + 1);
  await expect(dialog.getByLabel('主管辦公桌', { exact: true })).toBeVisible();
  await dialog.getByLabel('座位數（0 = 自動）', { exact: true }).fill('2');
  await dialog.getByLabel('W (m)', { exact: true }).fill('4.5');
  await dialog.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect
    .poll(async () => (await saved())?.objects.filter((o) => o.type === 'squad').length)
    .toBe(1);
  const layout = (await saved())!;
  expect(layout.schemaVersion).toBe(2); // version 2 is written only because the layout holds a squad
  expect(layout.objects.find((o) => o.type === 'squad')).toMatchObject({ seats: 2 });

  await page.reload();
  await page.getByRole('button', { name: '編輯配置（實驗性）', exact: true }).click();
  const editor = page.getByRole('dialog');
  const zone = editor
    .getByLabel('物件', { exact: true })
    .locator('option', { hasText: '小隊區域' });
  await expect(zone).toHaveCount(1); // the saved zone comes back

  // Removing it returns the file to version 1, so an older build can still read it.
  await editor
    .getByLabel('物件', { exact: true })
    .selectOption((await zone.getAttribute('value'))!);
  await editor.getByRole('button', { name: '移除', exact: true }).click();
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await saved())?.schemaVersion).toBe(1);
});

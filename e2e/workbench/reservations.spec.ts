import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('file reservations are listed with their advisory boundary stated', async ({ page }) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  const token = readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim();
  const headers = { authorization: `Bearer ${token}` };
  const [project] = (await (await page.request.get('/api/projects', { headers })).json()) as {
    id: string;
  }[];
  const reserve = await page.request.post('/api/commands', {
    headers,
    data: {
      schemaVersion: 1,
      type: 'reservation.acquire',
      projectId: project!.id,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      data: { patterns: ['e2e-reserved/**'], ttlSec: 600 },
    },
  });
  expect(reserve.ok()).toBe(true);

  await signIn(page);
  await page.getByRole('link', { name: '工作區', exact: true }).click();
  await expect(page.getByRole('heading', { name: '檔案預約' })).toBeVisible();
  await expect(
    page.getByText('不能阻止同一使用者的其他程式寫入檔案', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('e2e-reserved/**')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

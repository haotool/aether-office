import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('with the A2A gateway off, the UI says so and no A2A endpoint exists', async ({ page }) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A2A 閘道預設關閉' })).toBeVisible();
  // The web app's fallback page may answer unknown GETs, but it is never an Agent Card.
  const card = await page.request.get('/.well-known/agent-card.json');
  expect(await card.text()).not.toContain('supportedInterfaces');
  const rpc = await page.request.post('/a2a', {
    data: { jsonrpc: '2.0', id: 1, method: 'ListTasks', params: {} },
  });
  expect(await rpc.text()).not.toContain('jsonrpc'); // no JSON-RPC endpoint answers
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

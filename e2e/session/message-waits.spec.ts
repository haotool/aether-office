import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
test('request waiting records remain visible after reload and show a correlated reply', async ({
  page,
  request,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  const token = readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim();
  const headers = { authorization: `Bearer ${token}` };
  const session = await (await request.get('/api/session', { headers })).json();
  const projects = await (await request.get('/api/projects', { headers })).json();
  const projectId = projects[0].id;
  const send = async (data: unknown) => {
    const r = await request.post('/api/commands', {
      headers,
      data: {
        schemaVersion: 1,
        type: 'message.send',
        projectId,
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        data,
      },
    });
    expect(r.ok()).toBe(true);
    return (await r.json()).result;
  };
  const original = await send({
    recipients: [session.actor.id],
    body: '持久等待瀏覽器測試',
    kind: 'request',
  });
  await signIn(page);
  await page.getByRole('link', { name: /^訊息(?: \d+)?$/ }).click();
  const card = page
    .locator('article.message')
    .filter({ has: page.getByText('持久等待瀏覽器測試', { exact: true }) });
  await card.getByText('回覆等待紀錄', { exact: true }).click();
  await expect(card.getByText(/等待回覆/)).toBeVisible();
  await expect(card.getByText(/回覆期限/)).toBeVisible();
  await page.reload();
  await card.getByText('回覆等待紀錄', { exact: true }).click();
  await expect(card.getByText(/等待回覆/)).toBeVisible();
  const reply = await send({
    recipients: [session.actor.id],
    body: '合成關聯回覆',
    kind: 'inform',
    replyTo: original.id,
  });
  await expect(card.getByText(`回覆訊息 ID: ${reply.id}`, { exact: true })).toBeVisible();
  await expect(card.getByText(/等待回覆/)).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-message-waits.png' });
});

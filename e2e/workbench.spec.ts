import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('real HTTP journey: authenticate, inspect office, create and assign work, persist message and layout', async ({
  page,
  context,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  let authenticated = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !(
        !authenticated &&
        message.location().url.endsWith('/api/session') &&
        message.text().includes('401')
      )
    )
      errors.push(message.text());
  });
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  authenticated = true;
  await expect(page.getByRole('heading', { name: '軌道辦公室', exact: true })).toBeVisible();
  // Trace starts after credential input; no secret-bearing login request is recorded.
  await context.tracing.start({ screenshots: true, snapshots: false });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.scene-label').first()).toBeVisible();
  const labels = await page.locator('.scene-label').evaluateAll((elements) =>
    elements.map((element) => ({
      w: element.getBoundingClientRect().width,
      h: element.getBoundingClientRect().height,
    })),
  );
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((r) => r.w < 150 && r.h < 50)).toBe(true);
  await page.screenshot({ path: 'evidence/screenshots/e2e-office-1440.png' });
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/fox-lod0.glb') && r.ok()),
    page.locator('.scene-label').filter({ hasText: 'Atlas' }).click(),
  ]);
  await page.getByRole('button', { name: '聚焦桌位', exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: 'evidence/screenshots/e2e-desk-closeup.png' });
  await page.getByRole('button', { name: '重設視角', exact: true }).click();
  await page.getByRole('button', { name: '建立任務', exact: true }).click();
  await page.getByLabel('任務標題', { exact: true }).fill('端到端任務 · 真 HTTP');
  await page
    .getByLabel('工作說明', { exact: true })
    .fill('由瀏覽器派工，讓獨立 runner 啟動 fixture 程序。');
  await page.getByLabel('驗收條件', { exact: true }).fill('提交成果後仍需審查，不能直接完成。');
  await page.getByRole('button', { name: '建立', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: /端到端任務 · 真 HTTP/ }).click();
  await test.step('assign teammate', async () => {
    await page.getByLabel('選擇成員', { exact: true }).selectOption({ label: 'Atlas · demo' });
  });
  await page.getByRole('button', { name: '派工', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('待審查', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('dialog').getByText(/No paid model ran/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page
    .getByRole('link', { name: /^訊息\s*\d*$/ })
    .first()
    .click();
  await page.getByLabel('收件成員', { exact: true }).selectOption({ label: 'Mika' });
  await page.getByLabel('訊息內容', { exact: true }).fill('UTF-8 🦊 持久訊息 — reload 後仍存在');
  await page.getByRole('button', { name: '傳送', exact: true }).click();
  await expect(
    page.getByText('UTF-8 🦊 持久訊息 — reload 後仍存在', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('UTF-8 🦊 持久訊息 — reload 後仍存在', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '辦公室', exact: true }).click();
  await page.getByRole('button', { name: '編輯配置', exact: true }).click();
  await page.getByLabel('X (m)', { exact: true }).fill('-20.5');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '編輯配置', exact: true }).click();
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('-20.5');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '介面語言', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Orbital office', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.screenshot({ path: 'evidence/screenshots/e2e-office-light.png' });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await test.info().attach('accessibility.json', {
    body: JSON.stringify(audit.violations, null, 2),
    contentType: 'application/json',
  });
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
  await context.tracing.stop({ path: 'evidence/e2e-workbench-trace.zip' });
});

test('mobile uses a working 2D view and keyboard-operable modal', async ({ page }) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await expect(page.getByRole('heading', { name: '軌道辦公室', exact: true })).toBeVisible();
  await expect(page.locator('.office-2d')).toBeVisible();
  expect(await page.locator('canvas').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'evidence/screenshots/e2e-mobile-390.png' });
  await page.getByRole('button', { name: '建立任務', exact: true }).click();
  await expect(page.getByLabel('任務標題', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await test.info().attach('mobile-accessibility.json', {
    body: JSON.stringify(audit.violations, null, 2),
    contentType: 'application/json',
  });
  expect(audit.violations).toEqual([]);
});

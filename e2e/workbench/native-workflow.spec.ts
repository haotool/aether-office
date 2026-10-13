import { test, expect } from '@playwright/test';
import { NATIVE_SESSION, nativeOrigin, signIn } from '../support/sign-in.js';
import { nativeDataDirectory } from '../support/native-fixture.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
test('synthetic provider browser flow: permission, diff, review, commit-bound verification, human acceptance', async ({
  page,
}) => {
  const title = `合成程序完整工作鏈 ${randomUUID()}`;
  const button = (name: string | RegExp) =>
    page.getByRole('button', { name, exact: typeof name === 'string' });
  const field = (name: string) => page.getByLabel(name, { exact: true });
  const text = (name: string) => page.getByText(name, { exact: true });
  const workspace = page
    .locator('.workspace-card', { hasText: title })
    .filter({ hasText: '· 工作區' });
  const loadDiff = workspace.getByRole('button', { name: '讀取目前差異', exact: true });
  const dialog = page.getByRole('dialog');
  const terminal = page.locator('.terminal-screen');
  const directory = nativeDataDirectory();
  let authenticated = false;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    const login401 =
      !authenticated &&
      message.location().url.endsWith('/api/session') &&
      message.text().includes('401');
    if (message.type() === 'error' && !login401) errors.push(message.text());
  });
  await signIn(page, nativeOrigin(), { session: NATIVE_SESSION });
  authenticated = true;
  await page.getByRole('link', { name: '外部觀察', exact: true }).click();
  await expect(text('Observed fixture only · 不代表任務已完成').first()).toBeVisible({
    timeout: 15000,
  });
  await expect(text('OBSERVE · 唯讀')).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-observe.png' });
  const source = join(directory, 'observer-fixture', 'session.jsonl');
  const original = readFileSync(source);
  const observed = page.locator('article', {
    has: page.getByRole('heading', { name: 'External Observe Fixture' }),
  });
  try {
    unlinkSync(source);
    await expect(observed.getByText('來源檔案不存在', { exact: true })).toBeVisible({
      timeout: 15000,
    });
  } finally {
    writeFileSync(source, original);
  }
  await page.getByRole('link', { name: '辦公室', exact: true }).click();
  await button('建立任務').click();
  await field('任務標題').fill(title);
  await field('工作說明').fill('Synthetic wire fixture; no installed provider or paid model.');
  await field('驗收條件').fill('批准、審查、固定版本測試與接受分開完成。');
  await button('建立').click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', { name: /^任務/ }).click();
  await button(new RegExp(title)).click();
  await field('選擇成員').selectOption({ label: 'Synthetic Codex Wire · codex' });
  await button('派工').click();
  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: /^工具批准/ }).click();
  await expect(button('允許這次操作')).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: /^任務/ }).click();
  await button(new RegExp(title)).click();
  await expect(text('等待人類工具批准')).toBeVisible();
  await expect(text('機器心跳')).toBeVisible();
  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: /^工具批准/ }).click();
  await page.screenshot({ path: 'evidence/screenshots/e2e-synthetic-approval.png' });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  const confirmedBefore = await text('已明確確認').count();
  await button('允許這次操作').click();
  await expect(text('已明確確認')).toHaveCount(confirmedBefore + 1, { timeout: 15000 });
  await page.getByRole('link', { name: '工作區', exact: true }).click();
  await expect(loadDiff).toBeEnabled({ timeout: 10000 });
  await loadDiff.click();
  await expect(workspace.getByText('沒有已追蹤檔案差異', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(workspace.getByText(/此證據對應的版本/)).toBeVisible();
  await page.getByRole('link', { name: '成果審查', exact: true }).click();
  await expect(page.getByRole('region', { name: '程式碼區塊評論' })).toBeVisible();
  await expect(page.getByText('沒有可留言的區塊', { exact: false })).toBeVisible();
  for (const attempt of [1, 2, 3]) {
    await field('審查意見').fill('合成案例：再次退回以驗證執行上限。');
    await button('要求修改').click();
    await page.getByRole('link', { name: /^任務/ }).click();
    await button(new RegExp(title)).click();
    if (attempt === 1) await field('接續原提供者對話').check();
    if (attempt === 3) {
      await expect(button('重試 (3/3)')).toBeDisabled();
      await field('追加原因').fill('人工確認合成測試需要第四次執行。');
      await button('批准追加一次').click();
      await expect(button('重試 (3/4)')).toBeEnabled();
    }
    await button(`重試 (${attempt}/${attempt === 3 ? 4 : 3})`).click();
    if (attempt === 1) await expect(dialog.getByText('已派工', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '關閉', exact: true }).click();
    await page.getByRole('link', { name: /^工具批准/ }).click();
    await expect(button('允許這次操作')).toBeVisible({ timeout: 15000 });
    await button('允許這次操作').click();
    await expect(text('已明確確認')).toHaveCount(confirmedBefore + attempt + 1, { timeout: 15000 });
    await page.getByRole('link', { name: '成果審查', exact: true }).click();
    if (attempt === 1) await expect(page.getByText(/Fixture answer resumed/)).toBeVisible();
  }
  await page.getByRole('link', { name: '工作區', exact: true }).click();
  await expect(workspace.getByText(/歷史證據，不代表目前版本/)).toBeVisible();
  await page.getByRole('link', { name: '成果審查', exact: true }).click();
  await field('審查代理').selectOption({ label: 'Synthetic Reviewer Wire · codex' });
  await button('啟動代理審查').click();
  await expect(
    text('Synthetic native reviewer: fixed commit inspected, no live model used.'),
  ).toBeVisible({ timeout: 15000 });
  await expect(button('執行固定版本測試')).toBeEnabled();
  await button('執行固定版本測試').click();
  await expect(button('接受此版本成果')).toBeEnabled({ timeout: 15000 });
  await expect(page.getByText(/此證據對應的版本/)).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-synthetic-review.png' });
  await button('接受此版本成果').click();
  await expect(text('目前沒有待審查成果')).toBeVisible();
  await page.getByRole('link', { name: /^任務/ }).click();
  await button(new RegExp(title)).click();
  await expect(dialog.getByText('已接受', { exact: true })).toBeVisible();
  const repository = join(directory, 'fixture-repository');
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  const baseBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const baseBefore = git('rev-parse', baseBranch);
  await dialog.getByLabel('Base 分支', { exact: true }).fill(baseBranch);
  await dialog.getByLabel('預期的 base commit（完整 40 碼）', { exact: true }).fill(baseBefore);
  await dialog.getByRole('button', { name: '整合到候選分支', exact: true }).click();
  await expect(dialog.getByText('已包含於 base，無需整合', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect(git('rev-parse', baseBranch)).toBe(baseBefore);
  expect(git('branch', '--list', 'aether/integrate/*')).toBe('');
  await page.screenshot({ path: 'evidence/screenshots/e2e-integration.png' });
  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: '終端機', exact: true }).click();
  await button('啟動終端機').click();
  await expect(terminal).toContainText('PTY READY 狐狸', { timeout: 15000 });
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible();
  await button('接管輸入').click();
  await expect(page.getByText(/^您已接管 · running$/)).toBeVisible();
  await field('欄數').fill('101');
  await field('列數').fill('30');
  await button('調整尺寸').click();
  await field('PTY input').focus();
  await page.keyboard.type('hello');
  await expect(terminal).toContainText('PTY ECHO:hello SIZE:101x30', { timeout: 15000 });
  await page.reload();
  await page.getByRole('button', { name: /pty-fixture · running/ }).click();
  await expect(terminal).toContainText('PTY ECHO:hello SIZE:101x30');
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible();
  await button('停止終端機').click();
  await expect(page.getByText(/^唯讀 · exited$/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Exit code:/)).toBeVisible();
  await button('啟動終端機').click();
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible({ timeout: 15000 });
  await button('緊急停止').click();
  await button('確定停止所有執行').click();
  await expect(page.getByText(/^唯讀 · exited$/)).toBeVisible({ timeout: 15000 });
  await expect(button('緊急停止')).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-emergency-stop.png' });
  expect(errors).toEqual([]);
});

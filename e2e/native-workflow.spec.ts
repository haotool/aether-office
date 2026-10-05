import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
test('synthetic provider browser flow: permission, diff, review, commit-bound verification, human acceptance', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-native-session.json', 'utf8')) as {
    directory: string;
  };
  let authenticated = false;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  await page.goto('http://127.0.0.1:4330');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  authenticated = true;
  await page.getByRole('link', { name: '外部觀察', exact: true }).click();
  await expect(
    page.getByText('Observed fixture only · 不代表任務已完成', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('OBSERVE · 唯讀', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-observe.png' });
  unlinkSync(join(runtime.directory, 'observer-fixture', 'session.jsonl'));
  await expect(page.getByText('來源檔案不存在', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: '辦公室', exact: true }).click();
  await page.getByRole('button', { name: '建立任務', exact: true }).click();
  await page.getByLabel('任務標題', { exact: true }).fill('合成程序完整工作鏈');
  await page
    .getByLabel('工作說明', { exact: true })
    .fill('Synthetic wire fixture; no installed provider or paid model.');
  await page
    .getByLabel('驗收條件', { exact: true })
    .fill('批准、審查、固定版本測試與接受分開完成。');
  await page.getByRole('button', { name: '建立', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: /合成程序完整工作鏈/ }).click();
  await page
    .getByLabel('選擇成員', { exact: true })
    .selectOption({ label: 'Synthetic Codex Wire · codex' });
  await page.getByRole('button', { name: '派工', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: /^工具批准/ }).click();
  await expect(page.getByRole('button', { name: '允許這次操作', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: /合成程序完整工作鏈/ }).click();
  await expect(page.getByText('等待人類工具批准', { exact: true })).toBeVisible();
  await expect(page.getByText('機器心跳', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: /^工具批准/ }).click();
  await page.screenshot({ path: 'evidence/screenshots/e2e-synthetic-approval.png' });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole('button', { name: '允許這次操作', exact: true }).click();
  await expect(page.getByText('已明確確認', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: '工作區', exact: true }).click();
  await expect(page.getByRole('button', { name: '讀取目前差異', exact: true })).toBeEnabled({
    timeout: 10000,
  });
  await page.getByRole('button', { name: '讀取目前差異', exact: true }).click();
  await expect(page.getByText('沒有已追蹤檔案差異', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/此證據對應的版本/)).toBeVisible();
  await page.getByRole('link', { name: '成果審查', exact: true }).click();
  await expect(page.getByRole('region', { name: '程式碼區塊評論' })).toBeVisible();
  await expect(page.getByText('沒有可留言的區塊', { exact: false })).toBeVisible();
  await page.getByLabel('審查意見', { exact: true }).fill('請在原工作區繼續修正。');
  await page.getByRole('button', { name: '要求修改', exact: true }).click();
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: /合成程序完整工作鏈/ }).click();
  await page.getByLabel('接續原提供者對話', { exact: true }).check();
  await page.getByRole('button', { name: '重試 (1/3)', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('已派工', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: /^工具批准/ }).click();
  await expect(page.getByRole('button', { name: '允許這次操作', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: '允許這次操作', exact: true }).click();
  await expect(page.getByText('已明確確認', { exact: true })).toHaveCount(2, { timeout: 15000 });
  await page.getByRole('link', { name: '成果審查', exact: true }).click();
  await expect(page.getByText(/Fixture answer resumed/)).toBeVisible();
  for (const attempt of [2, 3]) {
    await page.getByLabel('審查意見', { exact: true }).fill('合成案例：再次退回以驗證執行上限。');
    await page.getByRole('button', { name: '要求修改', exact: true }).click();
    await page.getByRole('link', { name: /^任務/ }).click();
    await page.getByRole('button', { name: /合成程序完整工作鏈/ }).click();
    if (attempt === 3) {
      await expect(page.getByRole('button', { name: '重試 (3/3)', exact: true })).toBeDisabled();
      await page.getByLabel('追加原因', { exact: true }).fill('人工確認合成測試需要第四次執行。');
      await page.getByRole('button', { name: '批准追加一次', exact: true }).click();
      await expect(page.getByRole('button', { name: '重試 (3/4)', exact: true })).toBeEnabled();
    }
    await page
      .getByRole('button', { name: `重試 (${attempt}/${attempt === 3 ? 4 : 3})`, exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
    await page.getByRole('link', { name: /^工具批准/ }).click();
    await expect(page.getByRole('button', { name: '允許這次操作', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '允許這次操作', exact: true }).click();
    await expect(page.getByText('已明確確認', { exact: true })).toHaveCount(attempt + 1, {
      timeout: 15000,
    });
    await page.getByRole('link', { name: '成果審查', exact: true }).click();
  }
  await page.getByRole('link', { name: '工作區', exact: true }).click();
  await expect(page.getByText(/歷史證據，不代表目前版本/)).toBeVisible();
  await page.getByRole('link', { name: '成果審查', exact: true }).click();
  await page
    .getByLabel('審查代理', { exact: true })
    .selectOption({ label: 'Synthetic Reviewer Wire · codex' });
  await page.getByRole('button', { name: '啟動代理審查', exact: true }).click();
  await expect(
    page.getByText('Synthetic native reviewer: fixed commit inspected, no live model used.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '執行固定版本測試', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '執行固定版本測試', exact: true }).click();
  await expect(page.getByRole('button', { name: '接受此版本成果', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await expect(page.getByText(/此證據對應的版本/)).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-synthetic-review.png' });
  await page.getByRole('button', { name: '接受此版本成果', exact: true }).click();
  await expect(page.getByText('目前沒有待審查成果', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: /合成程序完整工作鏈/ }).click();
  await expect(page.getByRole('dialog').getByText('已接受', { exact: true })).toBeVisible();
  const repository = join(runtime.directory, 'fixture-repository');
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  const baseBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const baseBefore = git('rev-parse', baseBranch);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Base 分支', { exact: true }).fill(baseBranch);
  await dialog.getByLabel('預期的 base commit（完整 40 碼）', { exact: true }).fill(baseBefore);
  await dialog.getByRole('button', { name: '整合到候選分支', exact: true }).click();
  // The synthetic fixture commits nothing, so the honest outcome is "already in base".
  await expect(dialog.getByText('已包含於 base，無需整合', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect(git('rev-parse', baseBranch)).toBe(baseBefore); // base never moves
  expect(git('branch', '--list', 'aether/integrate/*')).toBe('');
  await page.screenshot({ path: 'evidence/screenshots/e2e-integration.png' });
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('link', { name: '終端機', exact: true }).click();
  await page.getByRole('button', { name: '啟動終端機', exact: true }).click();
  await expect(page.locator('.terminal-screen')).toContainText('PTY READY 狐狸', {
    timeout: 15000,
  });
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible();
  await page.getByRole('button', { name: '接管輸入', exact: true }).click();
  await expect(page.getByText(/^您已接管 · running$/)).toBeVisible();
  await page.getByLabel('欄數', { exact: true }).fill('101');
  await page.getByLabel('列數', { exact: true }).fill('30');
  await page.getByRole('button', { name: '調整尺寸', exact: true }).click();
  await page.getByLabel('PTY input', { exact: true }).focus();
  await page.keyboard.type('hello');
  await expect(page.locator('.terminal-screen')).toContainText('PTY ECHO:hello SIZE:101x30', {
    timeout: 15000,
  });
  await page.reload();
  await page.getByRole('button', { name: /pty-fixture · running/ }).click();
  await expect(page.locator('.terminal-screen')).toContainText('PTY ECHO:hello SIZE:101x30');
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible();
  await page.getByRole('button', { name: '停止終端機', exact: true }).click();
  await expect(page.getByText(/^唯讀 · exited$/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Exit code:/)).toBeVisible();
  // Emergency stop: one confirmed step halts a running terminal and switches live execution off.
  await page.getByRole('button', { name: '啟動終端機', exact: true }).click();
  await expect(page.getByText(/^唯讀 · running$/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '緊急停止', exact: true }).click();
  await page.getByRole('button', { name: '確定停止所有執行', exact: true }).click();
  await expect(page.getByText(/^唯讀 · exited$/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '緊急停止', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-emergency-stop.png' });
  expect(errors).toEqual([]);
});

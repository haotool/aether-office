import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function login(page: Page) {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await expect(page.locator('main')).toBeVisible();
}

// Moves focus with Tab only, until the focused element has the wanted accessible name.
async function tabTo(page: Page, name: RegExp, limit = 120) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return (el?.getAttribute('aria-label') ?? el?.innerText ?? '').trim();
    });
    if (name.test(label)) return;
  }
  throw new Error(`could not reach ${name} with the keyboard`);
}

test('a task can be created with the keyboard alone, the dialog traps focus, and Escape returns it', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await tabTo(page, /^建立任務$/);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('任務標題', { exact: true })).toBeFocused(); // focus moves into the dialog

  // Focus never escapes the modal, however long the user tabs.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    // Native modal dialogs may hand focus to the browser's own UI, but never to the page behind them.
    expect(
      await page.evaluate(() => {
        const el = document.activeElement;
        return !el || el === document.body || !!el.closest('dialog');
      }),
    ).toBe(true);
  }

  // Escape closes it and focus returns to the control that opened it.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '建立任務', exact: true })).toBeFocused();

  // Complete the whole flow with the keyboard.
  await page.keyboard.press('Enter');
  await page.keyboard.type('鍵盤建立的任務');
  await page.keyboard.press('Tab'); // description
  await page.keyboard.press('Tab'); // acceptance
  await page.keyboard.type('只用鍵盤也能完成');
  await tabTo(page, /^建立$/);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /鍵盤建立的任務/ })).toBeVisible();
});

test('the reduced-motion preference follows the operating system and can be changed explicitly', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await login(page);
  await page.getByRole('link', { name: '設定', exact: true }).click();
  const toggle = page.getByRole('switch', { name: /減少動態/ });
  await expect(toggle).toBeChecked(); // defaulted from prefers-reduced-motion, not guessed
  await toggle.uncheck();
  await page.reload();
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect(page.getByRole('switch', { name: /減少動態/ })).not.toBeChecked(); // the explicit choice persists
  await context.close();
});

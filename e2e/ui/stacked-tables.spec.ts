import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function strayCells(page: Page) {
  return page.evaluate(() => {
    const stray: string[] = [];
    const range = document.createRange();
    for (const cell of document.querySelectorAll(
      'table.stack td:not(:first-child):not(.actions)',
    )) {
      const lefts: number[] = [];
      for (const part of cell.childNodes) {
        if (part.nodeType === Node.TEXT_NODE && !part.textContent?.trim()) continue;
        range.selectNode(part);
        lefts.push(range.getBoundingClientRect().left);
      }
      if (lefts.some((left) => left < lefts[0]! - 1))
        stray.push(`${cell.getAttribute('data-label')}: ${lefts.map(Math.round).join(', ')}`);
    }
    return stray;
  });
}

test('a table row drawn as a card keeps every part of a value beside its label', async ({
  page,
}) => {
  await signIn(page, '/sessions');
  const running = page.getByRole('checkbox').first();
  if (await running.isChecked()) await running.uncheck();
  await expect(page.locator('table.stack td').first()).toBeVisible();
  expect(await strayCells(page), 'sessions').toEqual([]);
  await page.goto('/history');
  await expect(page.locator('table.stack td').first()).toBeVisible();
  expect(await strayCells(page), 'history').toEqual([]);
});

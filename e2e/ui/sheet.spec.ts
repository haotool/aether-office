import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a bottom sheet keeps the keyboard off the page behind it and hands focus back when it closes', async ({
  page,
}) => {
  await signIn(page, '/office');
  const chip = page.locator('button.chip-active');
  await chip.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    const behind = await page.evaluate(() => {
      const el = document.activeElement;
      return el !== null && el !== document.body && !el.closest('.sheet');
    });
    expect(behind, `Tab ${press + 1} left the sheet`).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(chip).toBeFocused();
});

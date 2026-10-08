import { test, expect, type Locator, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { throughout } from '../support/settled.js';
import AxeBuilder from '@axe-core/playwright';

// `?speech=1` gives every member a stand-in prompt and a Markdown reply (bold, code, bullets, a heading, Chinese text), to
// look at the bubbles without real sessions. The bubble must show them as styling, never as raw Markdown, and a reply taller
// than the bubble scrolls by itself until the pointer holds it.
async function open(page: Page, reducedMotion: boolean) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.addInitScript(
    (reduced) =>
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme: 'dark',
            locale: 'en',
            quality: 'balanced',
            view: '3d',
            reducedMotion: reduced,
            advanced: true,
          },
          version: 0,
        }),
      ),
    reducedMotion,
  );
  await signIn(page, '/office?speech=1');
  // The selected member speaks first; the demo has nobody working to speak unasked.
  await page.locator('.team-chip', { hasText: 'Atlas' }).click();
}

const reply = (page: Page): Locator =>
  page.locator('.speech:visible .speech-bubble.assistant').first();
const scrolled = (box: Locator) => box.locator('.speech-scroll').evaluate((el) => el.scrollTop);

test('a bubble shows Markdown as styling, never as raw syntax', async ({ page }) => {
  await open(page, false);
  const bubble = reply(page);
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  const text = (await bubble.textContent()) ?? '';
  expect(text).toContain('Preview reply, done:');
  expect(text).not.toMatch(/\*\*|`|\]\(|^#|^\s*-\s/m);
  await expect(bubble.locator('b').first()).toHaveText('Preview reply, done:');
  await expect(bubble.locator('code.chip').first()).toHaveText('upload.ts');
  await expect(bubble.locator('.sl.bullet .mk').first()).toHaveText('•');
  await expect(bubble.locator('.sl.heading .tx')).toHaveText('Next');
  expect(await bubble.getAttribute('role')).toBe('group');
  expect(
    (
      await new AxeBuilder({ page })
        .include('.world-speech')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('a tall reply scrolls by itself, and the pointer holds it', async ({ page }) => {
  await open(page, false);
  const bubble = reply(page);
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toHaveAttribute('data-overflow', 'true');
  expect(await scrolled(bubble)).toBe(0);
  // After a short pause it scrolls on its own.
  await expect.poll(() => scrolled(bubble), { timeout: 10_000 }).toBeGreaterThan(0);
  // Hovering holds it where it is (and shows more of it).
  await bubble.hover();
  const held = await scrolled(bubble);
  // A held bubble must not move in the frames that follow.
  await throughout(page, async () => expect(await scrolled(bubble)).toBe(held), 54);
});

test('with reduced motion it does not scroll: a clamped preview with a fade, and it expands on hover', async ({
  page,
}) => {
  await open(page, true);
  const bubble = reply(page);
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toHaveAttribute('data-overflow', 'true');
  // The auto-scroll starts after a short pause, and must not under reduced motion.
  await throughout(page, async () => expect(await scrolled(bubble)).toBe(0), 210);
  expect(
    await bubble.locator('.speech-scroll').evaluate((el) => getComputedStyle(el).maskImage),
  ).not.toBe('none');
  const clamped = await bubble.locator('.speech-scroll').evaluate((el) => el.clientHeight);
  await bubble.hover();
  await expect
    .poll(() => bubble.locator('.speech-scroll').evaluate((el) => el.clientHeight))
    .toBeGreaterThan(clamped);
});

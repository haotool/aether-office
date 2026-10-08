import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

// The squad in the panel. playwright.config.ts writes synthetic hook records for the fixture session (a SubagentStart
// and two PreToolUse with an agent_id), so it has one running Explore subagent for the whole run.
async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const option = page.locator('.project-picker select option', { hasText: 'fixture-repo' });
  await expect(option).toBeAttached({ timeout: 15000 });
  const projects = (await (await page.request.get('/api/projects')).json()) as {
    id: string;
    name: string;
  }[];
  return projects.find((p) => p.name === 'fixture-repo')!.id;
}

/** The panel or sheet passes axe (contrast included) in the dark theme and the light one. */
async function expectAccessible(page: Page, scope: string) {
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    const { violations } = await new AxeBuilder({ page })
      .include(scope)
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(violations, `${scope} ${theme}`).toEqual([]);
  }
  await page.evaluate(() => (document.documentElement.dataset['theme'] = 'dark'));
}

test('desktop: the supervisor row carries its subagent as a nested tree row, with keyboard navigation and a remembered fold', async ({
  page,
}) => {
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  const tree = panel.getByRole('tree');
  await expect(tree).toBeVisible({ timeout: 15000 });
  const parent = tree.getByRole('treeitem', { level: 1 });
  const child = tree.getByRole('treeitem', { level: 2 });
  await expect(parent).toHaveAttribute('aria-expanded', 'true');
  await expect(parent.locator('.squad-chip')).toContainText('1');
  await expect(child).toHaveCount(1);
  await expect(child).toContainText('Explore');
  await expect(child).toContainText('2'); // its two tool calls
  // A subagent is never a feed row of its own: one top-level row for the session.
  await expect(panel.locator('.feed-row')).toHaveCount(1);
  await expectAccessible(page, '.session-panel');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-feed.png' });

  // One tab stop: the parent. Down enters the squad, Left goes back, Left again folds, Right opens.
  await parent.focus();
  await page.keyboard.press('ArrowDown');
  await expect(child).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(parent).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await expect(child).toHaveCount(0);
  await page.reload();
  await expect(tree.getByRole('treeitem', { level: 1 })).toHaveAttribute('aria-expanded', 'false');
  await tree.getByRole('treeitem', { level: 1 }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(child).toHaveCount(1);

  // The polite live region exists and starts empty: nothing is announced for what was already there.
  await expect(panel.locator('[aria-live="polite"]').first()).toHaveText('');
});

test('desktop: a subagent row opens its own view with a spawned-by link; the supervisor shows a squad strip and an activity card', async ({
  page,
}) => {
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  await panel.getByRole('treeitem', { level: 2 }).click({ timeout: 15000 });
  await expect(page).toHaveURL(/%3Asub%3A/);
  const relation = panel.locator('.relation-chip');
  await expect(relation).toBeVisible();
  await expect(panel.locator('.sub-facts')).toContainText('Grep');
  // No task description is shown: the server sends none yet, and nothing is made up.
  await expect(panel.locator('.sub-facts')).not.toContainText(/任務|Task/);
  await expect(panel.locator('.conv-footer, .session-footer textarea')).toHaveCount(0);
  await expectAccessible(page, '.session-panel');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-subagent.png' });

  // The relation chip selects the supervisor.
  await relation.click();
  await expect(page).not.toHaveURL(/%3Asub%3A/);
  const strip = panel.locator('.squad-strip');
  await expect(strip).toBeVisible();
  const chip = strip.getByRole('button', { name: /Explore/ });
  const card = panel.locator('.sub-card');
  await expect(card).not.toHaveAttribute('open', '');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toHaveAttribute('open', '');
  await expect(card).toBeInViewport();
  await expect(card.locator('.sub-calls li')).toHaveCount(2);
  await expectAccessible(page, '.session-panel');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-conversation.png' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('phone: the nested row, the strip chip and the relation chip are all hit with a finger', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  await page.locator('.member-bar.feed-peek .icon-button').last().tap({ timeout: 15000 });
  const half = page.locator('.session-sheet.half');
  const child = half.getByRole('treeitem', { level: 2 });
  await expect(child).toBeVisible();
  expect((await child.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAccessible(page, '.session-sheet');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-phone-feed.png' });

  await child.tap();
  const full = page.locator('.session-sheet.full');
  const relation = full.locator('.relation-chip');
  await expect(relation).toBeVisible();
  expect((await relation.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-phone-subagent.png' });
  await relation.tap();
  const chip = full.locator('.squad-chip-button').first();
  await expect(chip).toBeVisible();
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectAccessible(page, '.session-sheet');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-phone-conversation.png' });
  await context.close();
});

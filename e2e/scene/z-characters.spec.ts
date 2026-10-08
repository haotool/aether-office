import { test, expect } from '@playwright/test';
import { settled } from '../support/settled.js';
import AxeBuilder from '@axe-core/playwright';
import {
  NAME,
  bringIntoView,
  enter,
  ids,
  live,
  pretend,
  removeSeatSessions,
  seedSeatSessions,
} from '../support/seats.js';

// Interacting with the characters of the 3D office directly: the action menu (click, keyboard, right click, press and
// hold), emotes, following the camera, pinning to the wall, carrying a desk to another seat (and undoing it), and a group
// picked with Shift. The sessions are synthetic transcripts in the fixture home (no process, no model); the repository is
// adopted as a project of its own, which is why this file runs last: it leaves no state that another spec reads.

test.beforeAll(seedSeatSessions);
test.afterAll(removeSeatSessions);

test('the action menu opens on a second click, a right click and Enter; Esc closes it and focus returns', async ({
  page,
}) => {
  await pretend(page, {
    state: 'active',
    startedAt: 1_700_000_000_000,
    quietMs: 1000,
    zombies: [],
  });
  await enter(page);
  const tag = await bringIntoView(page, 1);
  await expect(page.locator('.char-menu')).toHaveCount(0); // choosing it is not opening its menu
  await tag.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Open the conversation' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Follow camera' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(tag).toBeFocused();
  await page.keyboard.press('Enter'); // a keyboard press opens it at once
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await tag.click({ button: 'right' });
  await expect(menu).toBeVisible();
  // Honest: a session AETHER only watches cannot be typed into; each disabled action says why.
  await expect(menu.getByRole('menuitem', { name: /Continue in AETHER/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Quick message/ })).toHaveCount(0);
  const reply = menu.getByRole('menuitem', { name: /Quick replies/ });
  await expect(reply).toHaveAttribute('aria-disabled', 'true');
  await expect(reply).toContainText('Not started in AETHER');
  await expect(menu.getByRole('menuitem', { name: /Interrupt/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(menu.getByRole('menuitem', { name: /Copy resume command/ })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include('.char-layer')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-character-menu.png' });
});

test('the 3D model answers like its tag: a pointer cursor and a card on hover, a click on the chosen one opens the menu', async ({
  page,
}) => {
  await enter(page);
  const tag = await bringIntoView(page, 1);
  const box = (await tag.boundingBox())!;
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  // The model stands below its tag: look for it with the pointer, as a person would.
  const over = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    // The scene sets the cursor as the pointer enters a model; its card follows after a moment.
    if ((await page.evaluate(() => document.body.style.cursor)) !== 'pointer') return false;
    return page
      .getByRole('tooltip')
      .filter({ hasText: NAME(1) })
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false,
      );
  };
  let hit: [number, number] | null = null;
  for (const dy of [100, 130, 160, 190]) {
    for (const dx of [-80, -55, -30]) {
      if (await over(cx + dx, cy + dy)) hit = [cx + dx, cy + dy];
      if (hit) break;
    }
    if (hit) break;
  }
  // The first point that answers is the model's outline, which its idle sway moves a pixel either way: click further in.
  for (const deeper of hit ? [60, 40, 20] : []) {
    if (await over(hit![0], hit![1] + deeper)) {
      hit = [hit![0], hit![1] + deeper];
      break;
    }
  }
  if (hit) await over(...hit);
  expect(hit).not.toBeNull();
  expect(await page.evaluate(() => document.body.style.cursor)).toBe('pointer');
  await page.mouse.click(...hit!);
  await expect(page.getByRole('menu')).toBeVisible(); // it was already chosen: a second click opens its menu
  await page.keyboard.press('Escape');
  await page.mouse.click(...hit!, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
});

test('hovering shows a card after a moment and never takes the pointer', async ({ page }) => {
  await enter(page);
  const tag = await bringIntoView(page, 2);
  await page.mouse.move(5, 5);
  await tag.hover();
  await expect(page.locator('.char-card')).toHaveCount(0); // not at once
  const card = page.getByRole('tooltip');
  await expect(card).toBeVisible({ timeout: 2000 });
  await expect(card).toContainText(NAME(2));
  await expect(card).toContainText('Idle');
  await expect(card).toHaveCSS('pointer-events', 'none');
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
});

test('an emote plays once with an icon and an announcement; a second one inside the cooldown is refused', async ({
  page,
}) => {
  await enter(page);
  const tag = await bringIntoView(page, 1);
  await tag.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Wave' }).click();
  await expect(page.locator('.emote-sprite')).toHaveCount(1);
  await expect(live(page)).toContainText('Wave');
  await tag.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Cheer' }).click();
  await expect(live(page)).toContainText('Give it a moment');
  await expect(page.locator('.emote-sprite')).toHaveCount(1);
  await expect(page.locator('.emote-sprite')).toHaveCount(0, { timeout: 5000 }); // gone by itself
});

test('Follow camera holds until the camera is dragged; Pin to wall adds a view that stays', async ({
  page,
}) => {
  await enter(page);
  const tag = await bringIntoView(page, 1);
  const stage = page.locator('.canvas-container');
  await tag.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Follow camera' }).click();
  await expect(stage).toHaveAttribute(
    'data-following',
    /local:claude:bbbbbbbb-0000-4000-8000-000000000001/,
  );
  await expect(live(page)).toContainText('following');
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 330, { steps: 5 });
  await page.mouse.up();
  await expect(stage).not.toHaveAttribute('data-following', /.+/);
  await tag.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Look at screen/ }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await tag.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin to wall' }).click();
  await expect(page.locator('.pip.pinned')).toHaveCount(1);
  await expect(page.locator('.pip.pinned')).toContainText(NAME(1));
  await page
    .locator('.team-chip', { hasText: NAME(2) })
    .first()
    .click();
  await expect(page.locator('.pip.pinned')).toHaveCount(1); // choosing someone else does not unpin
});

test('Alt + drag carries a desk to a free seat, saves it, and the undo puts it back; Esc cancels', async ({
  page,
}) => {
  await enter(page);
  const tag = await bringIntoView(page, 1);
  const layout = async () => {
    const projects = (await (await page.request.get('/api/projects')).json()) as {
      id: string;
      name: string;
    }[];
    const project = projects.find((p) => p.name === 'fixture-seats')!;
    const snapshot = (await (
      await page.request.get(`/api/projects/${project.id}/snapshot`)
    ).json()) as {
      layout: {
        version: number;
        data: { objects: { agentId: string | null; x: number; z: number }[] };
      } | null;
    };
    const seat = snapshot.layout?.data.objects.find((o) => o.agentId === `local:claude:${ids[0]}`);
    return { version: snapshot.layout?.version ?? 0, seat };
  };
  const before = await layout();
  const box = (await tag.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  // Without Alt a press on a tag is only a click: nothing is carried.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 140, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.seat-hint')).toHaveCount(0);

  // Esc cancels a carry.
  await page.keyboard.down('Alt');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 140, { steps: 5 });
  await expect(page.locator('.seat-hint')).toContainText('Moving the seat');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('.seat-hint')).toHaveCount(0);
  expect((await layout()).version).toBe(before.version);

  // The main aisle is refused (red), a free seat is accepted and saved.
  await page.keyboard.down('Alt');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y + 120, { steps: 6 });
  await expect(page.locator('.seat-hint.blocked')).toBeVisible();
  await page.mouse.move(x + 150, y + 140, { steps: 6 });
  await expect(page.locator('.seat-hint.blocked')).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-character-drag.png' });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const toast = page.locator('.undo-toast');
  await expect(toast).toContainText('Seat moved');
  await expect.poll(async () => (await layout()).version).toBe(before.version + 1);
  const moved = (await layout()).seat!;
  expect(moved.x !== before.seat?.x || moved.z !== before.seat?.z).toBe(true);

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.undo-toast')).toContainText('undone');
  await expect.poll(async () => (await layout()).version).toBe(before.version + 2);
  const restored = (await layout()).seat!;
  expect([restored.x, restored.z]).toEqual([
    before.seat?.x ?? restored.x,
    before.seat?.z ?? restored.z,
  ]);
});

test('Shift picks a group; Send home asks for confirmation and sends nothing until it is given', async ({
  page,
}) => {
  // The page is told these sessions have been forgotten for days (see `pretend`).
  await pretend(page, {
    state: 'dormant',
    startedAt: 1_700_000_000_000,
    quietMs: 3 * 24 * 3600 * 1000,
    zombies: [],
  });
  let clockOuts = 0;
  page.on('request', (r) => r.url().includes('/clock-out') && clockOuts++);
  await enter(page);
  await bringIntoView(page, 1);
  const tags = page.locator('button.scene-label');
  // Tags of members off camera cannot be clicked: the same click, delivered straight to the tag.
  await tags.filter({ hasText: NAME(2) }).dispatchEvent('click', { shiftKey: true, detail: 1 });
  await tags.filter({ hasText: NAME(3) }).dispatchEvent('click', { shiftKey: true, detail: 1 });
  const bar = page.getByRole('toolbar', { name: 'Selected characters' });
  await expect(bar).toContainText('3 selected'); // the chosen member joined the group
  await bar.getByRole('button', { name: /Send home \(3\)/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(NAME(1));
  await expect(dialog).toContainText(NAME(3));
  await dialog.getByRole('button', { name: /Clock out \(3\)/ }).click();
  await expect(dialog).toContainText('Send them home?');
  await page.screenshot({ path: 'evidence/screenshots/e2e-character-send-home.png' });
  await dialog.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(clockOuts).toBe(0);
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap on the chosen character and a press-and-hold open the menu as a bottom sheet with finger-sized rows', async ({
    page,
  }) => {
    await enter(page);
    const projects = (await (await page.request.get('/api/projects')).json()) as {
      id: string;
      name: string;
    }[];
    const project = projects.find((p) => p.name === 'fixture-seats')!;
    // What a link from an alert does: the project, the member, the camera on its desk.
    await page.goto(
      `/office?project=${project.id}&agent=${encodeURIComponent(`local:claude:${ids[0]}`)}&focus=1`,
    );
    const tag = page.locator('button.scene-label.selected');
    await expect(tag).toBeVisible({ timeout: 15000 });
    await settled(tag); // the flight ends
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await tag.tap();
    const sheet = page.getByRole('dialog', { name: new RegExp(NAME(1)) });
    await expect(sheet).toBeVisible();
    const rows = await sheet
      .locator('.char-item, .char-react button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'evidence/screenshots/e2e-character-sheet.png' });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    const box = (await tag.boundingBox())!;
    const at = {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      pointerId: 7,
      bubbles: true,
    };
    await tag.dispatchEvent('pointerdown', at);
    await expect(sheet).toBeVisible();
    await tag.dispatchEvent('pointerup', at);
    // The hold's own click is not another tap: the menu is still there, once.
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});

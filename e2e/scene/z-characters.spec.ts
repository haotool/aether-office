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
  await expect(page.locator('.char-menu')).toHaveCount(0);
  await tag.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Open the conversation' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Follow camera' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(tag).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await tag.click({ button: 'right' });
  await expect(menu).toBeVisible();
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
  const cursor = () => page.evaluate(() => document.body.style.cursor);
  // The scene sets the cursor as the pointer enters a model, whose outline sways a few pixels: sweep the area as a
  // person would and take a point only when its whole 3 x 3 patch answered.
  const at = (col: number, row: number): [number, number] => [
    cx - 110 + col * 10,
    cy + 100 + row * 20,
  ];
  const answered = new Set<string>();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 15; col++) {
      await page.mouse.move(...at(col, row));
      if ((await cursor()) === 'pointer') answered.add(`${col},${row}`);
    }
  }
  const cells = [...answered].map((key) => key.split(',').map(Number) as [number, number]);
  const patch = (col: number, row: number) =>
    [-1, 0, 1].every((dc) => [-1, 0, 1].every((dr) => answered.has(`${col + dc},${row + dr}`)));
  const mean = (pick: (cell: [number, number]) => number) =>
    cells.reduce((sum, cell) => sum + pick(cell), 0) / cells.length;
  const [midCol, midRow] = [mean(([c]) => c), mean(([, r]) => r)];
  const distance = ([c, r]: [number, number]) => (c - midCol) ** 2 + (r - midRow) ** 2;
  const body = cells.filter(([c, r]) => patch(c, r)).sort((a, b) => distance(a) - distance(b))[0];
  expect(body, 'a body answers, not only a sliver of it').toBeDefined();
  const hit = at(...body!);
  await page.mouse.move(...hit);
  await expect.poll(cursor).toBe('pointer');
  await expect(page.getByRole('tooltip').filter({ hasText: NAME(1) })).toBeVisible();
  await page.mouse.click(...hit);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(...hit, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
});

test('hovering shows a card after a moment and never takes the pointer', async ({ page }) => {
  await enter(page);
  const tag = await bringIntoView(page, 2);
  await page.mouse.move(5, 5);
  await tag.hover();
  await expect(page.locator('.char-card')).toHaveCount(0);
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
  await expect(page.locator('.emote-sprite')).toHaveCount(0, { timeout: 5000 });
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
  await expect(page.locator('.pip.pinned')).toHaveCount(1);
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

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 140, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.seat-hint')).toHaveCount(0);

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
  await pretend(page, {
    state: 'dormant',
    startedAt: 1_700_000_000_000,
    quietMs: 3 * 24 * 3600 * 1000,
    zombies: [],
  });
  let clockOuts = 0;
  page.on('request', (r) => r.url().includes('/api/local-sessions/clock-out') && clockOuts++);
  await enter(page);
  await bringIntoView(page, 1);
  const tags = page.locator('button.scene-label');
  await tags.filter({ hasText: NAME(2) }).dispatchEvent('click', { shiftKey: true, detail: 1 });
  await tags.filter({ hasText: NAME(3) }).dispatchEvent('click', { shiftKey: true, detail: 1 });
  const bar = page.getByRole('toolbar', { name: 'Selected characters' });
  await expect(bar).toContainText('3 selected');
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
    await page.goto(
      `/office?project=${project.id}&agent=${encodeURIComponent(`local:claude:${ids[0]}`)}&focus=1`,
    );
    const tag = page.locator('button.scene-label.selected');
    await expect(tag).toBeVisible({ timeout: 15000 });
    await settled(tag);
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
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});

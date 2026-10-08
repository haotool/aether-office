import { test, expect, type Page } from '@playwright/test';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { frames, settled } from '../support/settled.js';
import {
  NAME,
  enter,
  folder,
  ids,
  removeSeatSessions,
  seedSeatSessions,
} from '../support/seats.js';

// A member keeps its desk while it stays in the office, whatever the order of activity: the observed building is no longer
// regenerated newest-first on every refresh. The sessions are synthetic transcripts in the fixture home.

test.beforeAll(seedSeatSessions);
test.afterAll(removeSeatSessions);

const tagOf = (page: Page, n: number) => page.locator('button.scene-label', { hasText: NAME(n) });

/** Where each member's name tag is centred on the screen (its width follows its text, its centre follows the desk). */
const positions = (page: Page) =>
  Promise.all(
    [1, 2, 3].map((n) =>
      tagOf(page, n).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      }),
    ),
  );

/** Gives session `n` (1 to 3) a modification time `agoMs` ago. */
const touch = (n: number, agoMs: number) => {
  const when = new Date(Date.now() - agoMs);
  utimesSync(join(folder, `${ids[n - 1]}.jsonl`), when, when);
};

test('reversing the order of activity moves nobody to another desk', async ({ page }) => {
  touch(1, 30_000); // newest first, whatever an earlier run left
  touch(2, 60_000);
  touch(3, 90_000);
  await enter(page);
  for (const n of [1, 2, 3]) await expect(tagOf(page, n)).toBeAttached();
  // The scene has projected the tags (they all stand at one point until its first frame) and the intro flight is over.
  await expect.poll(async () => new Set((await positions(page)).map((p) => p.join())).size).toBe(3);
  for (const n of [1, 2, 3]) await settled(tagOf(page, n));
  const before = await positions(page);

  // The newest becomes the oldest, and the page has fetched a list in which the sessions stand in the new order.
  const reordered = page.waitForResponse(
    async (r) => {
      if (!r.url().endsWith('/api/local-sessions')) return false;
      const { sessions } = (await r.json()) as { sessions: { sessionId: string; mtime: number }[] };
      const mine = sessions.filter((x) => ids.some((id) => x.sessionId === id));
      return mine.length === 3 && mine.every((x, i) => x.sessionId === ids[2 - i]);
    },
    { timeout: 30000 },
  );
  touch(1, 600_000);
  touch(2, 300_000);
  touch(3, 1000);
  await reordered;
  await frames(page, 30); // the scene takes the same data
  expect(await positions(page)).toEqual(before);

  // The desks are remembered: a reload, with the sessions now newest-first the other way round, seats everyone as before.
  await page.reload();
  await expect.poll(async () => new Set((await positions(page)).map((p) => p.join())).size).toBe(3);
  for (const n of [1, 2, 3]) await settled(tagOf(page, n));
  expect(await positions(page)).toEqual(before);
});

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

test.beforeAll(seedSeatSessions);
test.afterAll(removeSeatSessions);

const tagOf = (page: Page, n: number) => page.locator('button.scene-label', { hasText: NAME(n) });

const positions = (page: Page) =>
  Promise.all(
    [1, 2, 3].map((n) =>
      tagOf(page, n).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      }),
    ),
  );

const touch = (n: number, agoMs: number) => {
  const when = new Date(Date.now() - agoMs);
  utimesSync(join(folder, `${ids[n - 1]}.jsonl`), when, when);
};

test('reversing the order of activity moves nobody to another desk', async ({ page }) => {
  touch(1, 30_000);
  touch(2, 60_000);
  touch(3, 90_000);
  await enter(page);
  for (const n of [1, 2, 3]) await expect(tagOf(page, n)).toBeAttached();
  await expect.poll(async () => new Set((await positions(page)).map((p) => p.join())).size).toBe(3);
  for (const n of [1, 2, 3]) await settled(tagOf(page, n));
  const before = await positions(page);

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
  await frames(page, 30);
  expect(await positions(page)).toEqual(before);

  await page.reload();
  await expect.poll(async () => new Set((await positions(page)).map((p) => p.join())).size).toBe(3);
  for (const n of [1, 2, 3]) await settled(tagOf(page, n));
  expect(await positions(page)).toEqual(before);
});

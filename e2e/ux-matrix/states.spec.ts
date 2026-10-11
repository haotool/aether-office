import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  openContext,
  record,
  signedInPage,
  watchErrors,
  writeIndex,
  type Cell,
  type Tag,
} from './ux.js';

const SIZES = [
  [390, 844],
  [820, 1180],
] as const;
const COMBOS = [
  ['dark', 'zh-TW'],
  ['light', 'en'],
] as const;
const RETRY = /^(Retry|重試)$/;
const NEW_PROJECT = /^(New project|建立專案)$/;
const PAIR = /^(Open on your phone|在手機上開啟)$/;
const MORE = /^(More|更多)$/;
const PHONE_MAX = 760;

type Env = { context: BrowserContext; page: Page; tag: Tag; errors: string[] };

async function openOffice(page: Page) {
  await page.goto('/office');
  await page.locator('canvas').first().waitFor({ timeout: 20_000 });
}

async function loading({ page, tag, errors }: Env): Promise<Cell[]> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/projects', async (route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  await page.goto('/office', { waitUntil: 'commit' });
  const cell = await record(page, 'state-loading', tag, errors);
  release();
  return [cell];
}

async function failed({ page, tag, errors }: Env): Promise<Cell[]> {
  await page.route('**/api/projects', (route) =>
    route.fulfill({ status: 500, json: { error: 'INTERNAL_ERROR' } }),
  );
  await page.goto('/office');
  await expect(page.getByRole('button', { name: RETRY })).toBeVisible();
  return [await record(page, 'state-error', tag, errors, true)];
}

async function noProjects({ page, tag, errors }: Env): Promise<Cell[]> {
  await page.route('**/api/projects', (route) => route.fulfill({ json: [] }));
  await page.goto('/office');
  return [await record(page, 'state-no-projects', tag, errors)];
}

async function emptyOffice({ page, tag, errors }: Env): Promise<Cell[]> {
  await page.route(/\/api\/projects\/[^/]+\/snapshot$/, async (route) => {
    const response = await route.fetch();
    const snapshot = (await response.json()) as { agents: unknown[] };
    await route.fulfill({ response, json: { ...snapshot, agents: [] } });
  });
  await page.route('**/api/local-sessions', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as object;
    await route.fulfill({ response, json: { ...body, enabled: true, sessions: [] } });
  });
  await page.goto('/office');
  return [await record(page, 'state-empty-office', tag, errors)];
}

async function offline({ context, page, tag, errors }: Env): Promise<Cell[]> {
  await openOffice(page);
  await context.setOffline(true);
  await expect(page.locator('[data-status="offline"]').first()).toBeVisible({ timeout: 30_000 });
  return [await record(page, 'state-offline', tag, errors, true)];
}

async function reducedMotion({ page, tag, errors }: Env): Promise<Cell[]> {
  await openOffice(page);
  const office = await record(page, 'state-reduced-motion', tag, errors);
  await page.goto('/settings');
  return [office, await record(page, 'state-reduced-motion-settings', tag, errors)];
}

async function phoneOverlays({ page, tag, errors }: Env): Promise<Cell[]> {
  const cells: Cell[] = [];
  await openOffice(page);
  await page.locator('.member-bar.feed-peek .peek-top > .icon-button').tap();
  cells.push(await record(page, 'state-conversation-sheet', tag, errors));
  await openOffice(page);
  await page.locator('.tabbar').getByRole('button', { name: MORE }).tap();
  cells.push(await record(page, 'state-drawer', tag, errors));
  return cells;
}

async function dialogs({ page, tag, errors }: Env): Promise<Cell[]> {
  await openOffice(page);
  await page.getByRole('button', { name: NEW_PROJECT }).click();
  const project = await record(page, 'state-dialog-new-project', tag, errors);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: PAIR }).first().click();
  return [project, await record(page, 'state-dialog-pair', tag, errors)];
}

const overlays = (env: Env) => (env.tag.w <= PHONE_MAX ? phoneOverlays(env) : dialogs(env));

const STATES: { run: (env: Env) => Promise<Cell[]>; reduced?: boolean }[] = [
  { run: loading },
  { run: failed },
  { run: noProjects },
  { run: emptyOffice },
  { run: offline },
  { run: reducedMotion, reduced: true },
  { run: overlays },
];

for (const [w, h] of SIZES)
  for (const [theme, lang] of COMBOS)
    test(`states ${w}x${h} ${theme} ${lang}`, async ({ browser }) => {
      const cells: Cell[] = [];
      for (const state of STATES) {
        const tag: Tag = { w, h, theme, lang, reduced: state.reduced };
        const context = await openContext(browser, tag);
        const page = await signedInPage(context);
        const errors: string[] = [];
        watchErrors(page, errors);
        cells.push(...(await state.run({ context, page, tag, errors })));
        await context.close();
      }
      writeIndex(`states-${w}x${h}-${theme}-${lang}`, cells);
    });

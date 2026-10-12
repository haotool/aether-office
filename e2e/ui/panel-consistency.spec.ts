import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { NATIVE_SESSION, nativeOrigin, signIn } from '../support/sign-in.js';
import {
  NATIVE_RESUMABLE_SESSION_ID,
  continueNativeSessionIfNeeded,
  nativeFeedRow,
} from '../support/native-fixture.js';

const LAYOUTS = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
  tablet: { viewport: { width: 820, height: 1180 }, touch: true },
} as const;

async function allowLiveExecution(page: Page, projectId: string) {
  await page.goto(`${nativeOrigin()}/settings/models?project=${projectId}`);
  const allow = page.getByRole('switch', { name: '允許此專案執行真實代理' });
  await expect(allow).toBeVisible();
  if (await allow.isChecked()) return;
  await allow.check();
  await allow.locator('xpath=ancestor::form').getByRole('button', { name: '儲存' }).click();
  await expect(allow).toBeChecked();
}

async function openConversation(page: Page, phone: boolean) {
  await signIn(page, nativeOrigin(), { session: NATIVE_SESSION });
  await expect(page.getByRole('link', { name: '辦公室', exact: true }).first()).toBeVisible();
  const projects = (await (await page.request.get(`${nativeOrigin()}/api/projects`)).json()) as {
    id: string;
    name: string;
  }[];
  const project = projects.find((p) => p.name.startsWith('Synthetic browser fixture'))!;
  await allowLiveExecution(page, project.id);
  await page.goto(`${nativeOrigin()}/office?project=${project.id}`);
  if (phone) {
    await page.getByRole('button', { name: '開啟 session 列表' }).tap();
    const row = nativeFeedRow(page.locator('.session-sheet.half'), NATIVE_RESUMABLE_SESSION_ID);
    await expect(row).toBeVisible({ timeout: 45_000 });
    await row.tap();
    return page.locator('.session-sheet.full');
  }
  const panel = page.locator('.session-panel');
  if (page.viewportSize()!.width <= 1000)
    await page.getByRole('button', { name: '即時 session' }).click();
  const row = nativeFeedRow(panel, NATIVE_RESUMABLE_SESSION_ID);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  return panel;
}

for (const [layout, { viewport, touch }] of Object.entries(LAYOUTS))
  test(`${layout}: the composer controls and the scrollers of the panel`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch && viewport.width < 500,
    });
    const page = await context.newPage();
    const scope = await openConversation(page, viewport.width < 761);
    await continueNativeSessionIfNeeded(scope);
    const measured = await scope.evaluate((root) => {
      const heights = (selector: string) =>
        [...root.querySelectorAll<HTMLElement>(selector)]
          .map((el) => Math.round(el.getBoundingClientRect().height))
          .filter((h) => h > 0);
      const scrollers = [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
        const { overflowY } = getComputedStyle(el);
        return (
          (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight
        );
      });
      return {
        chips: heights('.u-chip'),
        send: heights('.composer-send'),
        box: heights('.composer-box textarea'),
        nested: scrollers
          .filter((el) => scrollers.some((other) => other !== el && other.contains(el)))
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      };
    });
    const shots = process.env['AETHER_SHOTS'];
    if (shots) {
      mkdirSync(shots, { recursive: true });
      for (const theme of ['dark', 'light']) {
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        await page.screenshot({ path: `${shots}/panel-${layout}-${theme}.png` });
      }
    }
    expect(measured.chips.length).toBeGreaterThan(0);
    expect(new Set(measured.chips).size, `chip heights ${measured.chips}`).toBe(1);
    expect(
      Math.abs(measured.box[0]! - measured.send[0]!),
      `Send ${measured.send}, box ${measured.box}`,
    ).toBeLessThanOrEqual(4);
    expect(measured.nested, 'nested vertical scrollers').toEqual([]);
    await context.close();
  });

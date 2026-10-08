import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { NATIVE_SESSION, nativeOrigin, signIn } from '../support/sign-in.js';

/**
 * The session panel (and the phone sheet) keep to the control scale: the chips of the composer are one height, the
 * Send button and the text box are one height, and the conversation has a single vertical scroller. The native server is
 * used because its fixture session can be opened and answered by a fake CLI, never a model.
 * Set AETHER_SHOTS=<dir> to also save a dark and a light screenshot of each layout there.
 */
const LAYOUTS = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
  tablet: { viewport: { width: 820, height: 1180 }, touch: true },
} as const;

/**
 * "Continue in AETHER" needs the project's live execution on, and the native server is shared: native-workflow.spec.ts ends
 * with the emergency stop, which switches it off for every spec that runs after it.
 */
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
    await page.locator('.session-sheet.half .feed-row').first().tap();
    return page.locator('.session-sheet.full');
  }
  const panel = page.locator('.session-panel');
  // below 1000px the panel lies over the office and is closed until asked for
  if (page.viewportSize()!.width <= 1000)
    await page.getByRole('button', { name: '即時 session' }).click();
  await panel.locator('.feed-row').first().click();
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
    // the first run of a server only reads the session; "Continue in AETHER" makes it drivable (the fake CLI)
    const resume = scope.getByRole('button', { name: '在 AETHER 繼續', exact: true });
    const composer = scope.getByLabel('傳訊息給 session');
    await expect(resume.or(composer)).toBeVisible({ timeout: 20000 });
    // an earlier run may have continued it already: the button can give way to the composer between the check and the click
    if (await resume.isVisible()) await resume.click({ timeout: 3000 }).catch(() => undefined);
    await expect(scope.getByLabel('傳訊息給 session')).toBeVisible({ timeout: 45000 });
    const measured = await scope.evaluate((root) => {
      const heights = (selector: string) =>
        [...root.querySelectorAll<HTMLElement>(selector)]
          .map((el) => Math.round(el.getBoundingClientRect().height))
          .filter((h) => h > 0);
      // a vertical scroller that sits inside another one is a double scrollbar
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
    // the box grows with its line, Send is the control height; they sit on one baseline within a few px
    expect(
      Math.abs(measured.box[0]! - measured.send[0]!),
      `Send ${measured.send}, box ${measured.box}`,
    ).toBeLessThanOrEqual(4);
    expect(measured.nested, 'nested vertical scrollers').toEqual([]);
    await context.close();
  });

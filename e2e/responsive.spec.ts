import { test, expect, type Page } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import { mkdirSync, readFileSync } from 'node:fs';

// The UI rules (AGENTS.md → "UI rules") as a check, on every page at four widths: nothing sideways, no text under the
// type floor, and, where the pointer is a finger, every control a finger target.
const PAGES = [
  'office',
  'agents',
  'tasks',
  'messages',
  'workspace',
  'terminals',
  'sessions',
  'observations',
  'reviews',
  'approvals',
  'knowledge',
  'machines',
  'history',
  'settings',
] as const;
const VIEWPORTS = [
  { name: 'phone-small', width: 320, height: 640, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'tablet', width: 820, height: 1180, touch: true },
  { name: 'laptop', width: 1280, height: 800, touch: false },
  { name: 'tablet-landscape', width: 1194, height: 834, touch: true },
  { name: 'laptop-short', width: 1366, height: 620, touch: false },
] as const;
const TYPE_FLOOR = 11;
const TOUCH_TARGET = 36; // the control itself; a finger's 44px comes from a hit area that extends past it (touch-targets.css)

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  return projects[0]!.id;
}

/** What breaks the rules on the page as it is now, one line per offender. */
function audit({ touch, floor, target }: { touch: boolean; floor: number; target: number }) {
  const problems: string[] = [];
  const width = document.documentElement.clientWidth;
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/)[0]}` : ''} "${(
      el.getAttribute('aria-label') ||
      el.textContent ||
      ''
    )
      .trim()
      .slice(0, 24)}"`;
  const shown = (el: Element) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    );
  };
  if (document.documentElement.scrollWidth - width > 1)
    problems.push(`page scrolls sideways by ${document.documentElement.scrollWidth - width}px`);
  const seen = new Set<string>();
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('canvas, svg, .world-labels')) continue;
    const box = el.getBoundingClientRect();
    let inScroller = false; // inside a box that scrolls sideways by design
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement)
      if (['auto', 'scroll'].includes(getComputedStyle(up).overflowX)) inScroller = true;
    if (!inScroller && box.right > width + 1 && box.left < width)
      problems.push(`past the right edge: ${label(el)} (${Math.round(box.right)}px)`);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    // Cut off: a text or a control partly outside an ancestor that clips it and does not scroll.
    if (own || el.matches('button, a[href], select, input, summary')) {
      for (
        let up = el.parentElement;
        up && up !== document.documentElement;
        up = up.parentElement
      ) {
        const style = getComputedStyle(up);
        if (
          ['auto', 'scroll'].includes(style.overflowX) ||
          ['auto', 'scroll'].includes(style.overflowY)
        )
          break; // it scrolls, so the rest is reachable
        const clips =
          ['hidden', 'clip'].includes(style.overflowX) ||
          ['hidden', 'clip'].includes(style.overflowY);
        if (!clips || up === document.body || up.matches('thead')) continue;
        const frame = up.getBoundingClientRect();
        if (
          box.left < frame.left - 2 ||
          box.right > frame.right + 2 ||
          box.top < frame.top - 2 ||
          box.bottom > frame.bottom + 2
        )
          problems.push(`cut off by ${label(up)}: ${label(el)}`);
        break;
      }
    }
    if (own && parseFloat(getComputedStyle(el).fontSize) < floor)
      problems.push(`text under ${floor}px: ${label(el)} (${getComputedStyle(el).fontSize})`);
    if (!touch) continue;
    const control = el.matches(
      'button, select, summary, input:not([type=hidden]), a[href], [role=button], [role=tab]',
    );
    if (!control) continue;
    // A checkbox is operated through its row; a link inside running text is exempt (WCAG 2.5.8).
    const row =
      el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')
        ? el.closest('label')!
        : el;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
    const size = row.getBoundingClientRect();
    if (Math.min(size.width, size.height) < target - 0.5) {
      const key = label(row);
      if (!seen.has(key)) {
        seen.add(key);
        problems.push(
          `target under ${target}px: ${key} (${Math.round(size.width)}x${Math.round(size.height)})`,
        );
      }
    }
  }
  return problems;
}

for (const viewport of VIEWPORTS)
  test(`${viewport.name} (${viewport.width}px): every page keeps to the UI rules`, async ({
    browser,
  }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
      isMobile: viewport.touch,
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({ state: { locale: 'zh-TW', quality: 'low', view: '2d' }, version: 0 }),
      ),
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const projectId = await login(page);
    mkdirSync('evidence/screenshots', { recursive: true });
    const failures: string[] = [];
    for (const name of PAGES) {
      await page.goto(`/${name}?project=${projectId}`);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const problems = await page.evaluate(audit, {
        touch: viewport.touch,
        floor: TYPE_FLOOR,
        target: TOUCH_TARGET,
      });
      for (const p of problems.slice(0, 6)) failures.push(`${name}: ${p}`);
      await page.screenshot({
        path: `evidence/screenshots/responsive-${name}-${viewport.name}.png`,
      });
    }
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

test('a phone shows the 3D office filling the screen, with a floor rail and no text over it', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  await page.goto('/office');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 }); // the 3D chunk is loaded on demand
  // The canvas is sized by the scene a moment after it appears.
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(844 * 0.7); // the scene is the screen, bar and tabs aside
  const box = (await canvas.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  await expect(page.locator('.scene-rail')).toBeVisible();
  await expect(page.locator('.tabbar')).toBeVisible();
  // No heading, stats or panels over or above the scene.
  await expect(page.locator('.office-heading, .office-stats, .building-panel')).toHaveCount(0);
  // Without asking for names, no name tag is drawn over the scene.
  await expect(page.locator('.scene-label:visible')).toHaveCount(0);
  await page.getByRole('button', { name: '更多控制' }).tap(); // the switches are folded away until asked for
  await page.getByRole('button', { name: '顯示名稱' }).tap();
  await expect(page.locator('.scene-label').first()).toBeAttached();
  await context.close();
});

test('a phone on its side gives the scene the screen, and the drawer still switches project', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  await page.goto('/office');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.mobile-menu')).toBeVisible(); // navigation is the drawer, not a column
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeHidden(); // no height to spare for it
  await expect
    .poll(async () => (await page.locator('canvas').boundingBox())!.height)
    .toBeGreaterThan(390 * 0.7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('.mobile-menu').tap();
  await expect(page.locator('.sidebar.open .drawer-project select')).toBeVisible();
  await context.close();
});

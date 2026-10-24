import { test, expect, type Request } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { PAGES } from '../support/pages.js';
import { zh } from '../../apps/web/src/locales/zh.js';
import { mkdirSync } from 'node:fs';

const VIEWPORTS = [
  { name: 'phone-small', width: 320, height: 640, touch: true },
  { name: 'phone-narrow', width: 360, height: 800, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'tablet', width: 820, height: 1180, touch: true },
  { name: 'tablet-air-landscape', width: 1180, height: 820, touch: true },
  { name: 'laptop', width: 1280, height: 800, touch: false },
  { name: 'tablet-landscape', width: 1194, height: 834, touch: true },
  { name: 'laptop-short', width: 1366, height: 620, touch: false },
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'desktop-wide', width: 1920, height: 1080, touch: false },
] as const;
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

function audit({ touch, floor, target }: { touch: boolean; floor: number; target: number }) {
  const problems: string[] = [];
  const width = document.documentElement.clientWidth;
  const label = (el: Element) => {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}.${el.classList[0] ?? ''} "${text}"`;
  };
  const shown = (el: Element) => {
    const { width, height } = el.getBoundingClientRect();
    const { visibility, display } = getComputedStyle(el);
    return width > 0 && height > 0 && visibility !== 'hidden' && display !== 'none';
  };
  if (document.documentElement.scrollWidth - width > 1)
    problems.push(`page scrolls sideways by ${document.documentElement.scrollWidth - width}px`);
  const seen = new Set<string>();
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('canvas, svg, .world-labels')) continue;
    const box = el.getBoundingClientRect();
    let inScroller = false;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement)
      if (['auto', 'scroll'].includes(getComputedStyle(up).overflowX)) inScroller = true;
    if (!inScroller && box.right > width + 1 && box.left < width)
      problems.push(`past the right edge: ${label(el)} (${Math.round(box.right)}px)`);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
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
          break;
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
  const fixed = (el: Element) => {
    for (let up: Element | null = el; up; up = up.parentElement)
      if (['fixed', 'sticky'].includes(getComputedStyle(up).position)) return true;
    return false;
  };
  const layers = [
    ...document.querySelectorAll(
      'button, select, summary, input:not([type=hidden]), a[href], [role=button], [role=tab]',
    ),
  ]
    .filter(
      (el) =>
        shown(el) &&
        !el.closest('canvas, svg, .world-labels') &&
        el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }),
    )
    .map((el) => {
      const own = fixed(el);
      const { left, top, right, bottom } = el.getBoundingClientRect();
      const seen = { left, top, right, bottom };
      for (let up = own ? null : el.parentElement; up; up = up.parentElement) {
        const style = getComputedStyle(up);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const frame = up.getBoundingClientRect();
        seen.left = Math.max(seen.left, frame.left);
        seen.top = Math.max(seen.top, frame.top);
        seen.right = Math.min(seen.right, frame.right);
        seen.bottom = Math.min(seen.bottom, frame.bottom);
      }
      return { el, seen, fixed: own };
    })
    .filter(({ seen }) => seen.right > seen.left && seen.bottom > seen.top);
  for (let i = 0; i < layers.length; i += 1)
    for (let j = i + 1; j < layers.length; j += 1) {
      const a = layers[i]!;
      const b = layers[j]!;
      if (a.fixed !== b.fixed || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.seen.right, b.seen.right) - Math.max(a.seen.left, b.seen.left);
      const h = Math.min(a.seen.bottom, b.seen.bottom) - Math.max(a.seen.top, b.seen.top);
      if (w <= 0 || h <= 0) continue;
      const area = (v: typeof a.seen) => (v.right - v.left) * (v.bottom - v.top);
      if ((w * h) / Math.min(area(a.seen), area(b.seen)) > 0.25)
        problems.push(`overlap: ${label(a.el)} on ${label(b.el)}`);
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
    const pending = new Set<Request>();
    page.on('request', (r) => {
      if (r.resourceType() !== 'eventsource') pending.add(r);
    });
    page.on('requestfinished', (r) => pending.delete(r));
    page.on('requestfailed', (r) => pending.delete(r));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    mkdirSync('evidence/screenshots', { recursive: true });
    const failures: string[] = [];
    for (const name of PAGES) {
      // Document unloads cancel streams that WebKit reports as access-control errors.
      await page.evaluate((path) => {
        history.pushState(history.state, '', path);
        dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      }, `/${name}`);
      if (name === 'office') await expect(page.locator('.office-2d')).toBeVisible();
      else {
        const title = {
          ...zh,
          agents: zh.team,
          sessions: zh.sessionsPage,
          knowledge: zh.knowledgeTitle,
        }[name];
        await expect(page.locator('main h1:visible').first()).toHaveText(title);
      }
      await expect.poll(() => pending.size).toBe(0);
      const problems = await page.evaluate(audit, {
        touch: viewport.touch,
        floor: 11,
        target: 36,
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
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await signIn(page, '/office');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(844 * 0.7);
  const box = (await canvas.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  await expect(page.locator('.scene-rail')).toBeVisible();
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.office-heading, .office-stats, .building-panel')).toHaveCount(0);
  await expect(page.locator('.scene-label:visible')).toHaveCount(0);
  await page.getByRole('button', { name: '更多控制' }).tap();
  await page.getByRole('button', { name: '顯示名稱' }).tap();
  await expect(page.locator('.scene-label').first()).toBeAttached();
  await context.close();
});

test('a phone scrolls the 2D list below the view switch and the chips, down to a card above the new-task button', async ({
  browser,
}) => {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(() =>
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { advanced: true }, version: 1 }),
    ),
  );
  const page = await context.newPage();
  await signIn(page, '/office');
  await page.getByRole('button', { name: '2D', exact: true }).tap();
  const list = page.locator('.office-2d');
  await expect(list.locator('.agent-card').first()).toBeVisible();
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const edges = await page.evaluate(() => {
    const bottom = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().bottom;
    const cards = [...document.querySelectorAll('.office-2d .agent-card')];
    return {
      hud: Math.max(bottom('.phone-top'), bottom('.phone-kpi')),
      listTop: document.querySelector('.office-2d')!.getBoundingClientRect().top,
      lastCard: cards[cards.length - 1]!.getBoundingClientRect().bottom,
      fab: document.querySelector('.fab')!.getBoundingClientRect().top,
    };
  });
  expect(edges.listTop).toBeGreaterThanOrEqual(edges.hud - 0.5);
  expect(edges.lastCard).toBeLessThanOrEqual(edges.fab + 0.5);
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
  await signIn(page, '/office');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.mobile-menu')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeHidden();
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

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NATIVE_SESSION, nativeOrigin, signIn } from '../support/sign-in.js';

/**
 * One role, one height: the same kind of control must not be drawn at a different size on every page. Each role is
 * measured on the 14 views at three layouts (desktop with a mouse; a phone and a tablet with a finger), on the 3D
 * office and with the phone's drawer open, and the number of distinct heights per role may not pass its limit. The
 * sizes come from the control scale in tokens.css (--control-h-sm/md/lg), so a new one-off height fails here instead of
 * drifting back in. Nothing is excluded: the scene toolbar, the session panel and sheet, the composer, the squad, quick
 * open, the tab bar and the drawer are measured like any page. A second check holds a finger's 44px hit area.
 */
const VIEWS = [
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
const LAYOUTS = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
  tablet: { viewport: { width: 820, height: 1180 }, touch: true },
} as const;

const ROLES: Record<string, { selector: string; limit: number }> = {
  button: {
    selector: '.primary, .secondary, .text-button, .u-btn:not(.u-btn--icon), button:not([class])',
    limit: 3,
  },
  'icon button': { selector: '.icon-button, .u-btn--icon', limit: 1 },
  input: {
    selector:
      'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file]), select',
    limit: 2,
  },
  chip: { selector: '.badge, .u-chip', limit: 2 },
  segmented: { selector: '.u-segmented button, .view-switch button, .segmented button', limit: 1 },
  'tab bar item': { selector: '.tab', limit: 1 },
  'drawer row': { selector: '.sidebar.open .nav-link', limit: 1 },
};

/** A finger needs 44px: a control drawn smaller must reach it with a hit area (touch-targets.css). */
const FINGER = 44;
// A field (a switch input too) is drawn 40px and cannot carry a pseudo-element; the labels anchored in the 3D scene are
// picked on the canvas, so their size follows the model, not the page.
const INTERACTIVE =
  'button:not(.scene-label):not(.zone-label), a[href], summary, [role=tab], [role=switch]:not(input)';

async function open(
  browser: import('@playwright/test').Browser,
  layout: keyof typeof LAYOUTS,
  view: '2d' | '3d',
): Promise<{ context: BrowserContext; page: Page; project: string }> {
  const { viewport, touch } = LAYOUTS[layout];
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch && viewport.width < 500,
  });
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: { theme: 'dark', locale: 'zh-TW', quality: 'low', view: value, advanced: true },
          version: 0,
        }),
      );
    } catch {
      // storage unavailable: the page still has to render
    }
  }, view);
  const page = await context.newPage();
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  return { context, page, project: projects[0]!.id };
}

async function show(page: Page, view: string, project: string) {
  await page.goto(`/${view}?project=${project}`);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

type Seen = { distinct: Map<string, Set<number>>; examples: Map<string, string> };
const newSeen = (): Seen => ({
  distinct: new Map(Object.keys(ROLES).map((role) => [role, new Set()])),
  examples: new Map(),
});

async function measure(page: Page, label: string, seen: Seen) {
  const heights = await page.evaluate(
    ([roles]) => {
      const out: Record<string, [number, string][]> = {};
      for (const [role, selector] of Object.entries(roles)) {
        out[role] = [];
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue;
          // a label that wrapped onto more lines is the content's height, not the control's own
          if (box.height > parseFloat(style.fontSize) * 3.2) continue;
          out[role]!.push([
            Math.round(box.height),
            `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40),
          ]);
        }
      }
      return out;
    },
    [Object.fromEntries(Object.entries(ROLES).map(([r, v]) => [r, v.selector]))] as [
      Record<string, string>,
    ],
  );
  for (const [role, list] of Object.entries(heights))
    for (const [h, who] of list) {
      seen.distinct.get(role)!.add(h);
      seen.examples.set(`${role}${h}`, `${label}:${who}`);
    }
}

/** The roles that broke their limit, for the quality scorecard (scripts/quality/areas/ui.mjs reads evidence/role-variance.json). */
const violations: {
  page: string;
  viewport: string;
  role: string;
  distinct: number;
  max: number;
}[] = [];
test.afterAll(() => {
  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/role-variance.json', JSON.stringify({ violations }, null, 2));
});

function judge(layout: string, seen: Seen) {
  for (const [role, { limit }] of Object.entries(ROLES)) {
    const heights = [...seen.distinct.get(role)!].sort((a, b) => a - b);
    const detail = heights.map((h) => `${h} (${seen.examples.get(`${role}${h}`)})`).join(', ');
    if (heights.length > limit)
      violations.push({
        page: 'all',
        viewport: layout,
        role,
        distinct: heights.length,
        max: limit,
      });
    expect
      .soft(heights.length, `${layout} ${role} heights: ${detail}; limit ${limit}`)
      .toBeLessThanOrEqual(limit);
  }
}

for (const layout of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
  test(`${layout}: each role keeps to its heights on the ${VIEWS.length} views, the 3D office and the drawer`, async ({
    browser,
  }) => {
    test.setTimeout(300000);
    const seen = newSeen();
    const flat = await open(browser, layout, '2d');
    for (const view of VIEWS) {
      await show(flat.page, view, flat.project);
      await measure(flat.page, view, seen);
    }
    await flat.context.close();
    const scene = await open(browser, layout, '3d');
    await show(scene.page, 'office', scene.project);
    await measure(scene.page, 'office-3d', seen);
    // the session sheet: the member bar of the first chip, then the conversation it opens
    const chip = scene.page.locator('.sheet-chip').first();
    if (await chip.count()) {
      await chip.click();
      await expect(scene.page.locator('.member-bar:not(.feed-peek)')).toBeVisible();
      await measure(scene.page, 'member bar', seen);
      await scene.page.getByRole('button', { name: '開啟對話' }).click();
      await expect(scene.page.locator('.session-sheet.full')).toBeVisible();
      await measure(scene.page, 'sheet', seen);
      await scene.page.getByRole('button', { name: '收合', exact: true }).click();
    }
    // the drawer: the tab bar's "more" on a portrait phone, the menu button where there is no sidebar
    const opener = scene.page
      .locator('.tab[aria-expanded], .mobile-menu')
      .filter({ visible: true });
    if (await opener.count()) {
      await opener.first().click();
      await expect(scene.page.locator('.sidebar.open')).toBeVisible();
      await measure(scene.page, 'drawer', seen);
    }
    await scene.context.close();
    judge(layout, seen);
  });
}

for (const layout of ['phone', 'tablet'] as const)
  test(`${layout}: every control reaches a ${FINGER}px hit area`, async ({ browser }) => {
    test.setTimeout(300000);
    const misses = new Set<string>();
    const probe = async (page: Page, label: string, within = 'body') => {
      const found = await page.evaluate(
        ([selector, finger, scope]) => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(
            selector
              .split(', ')
              .map((part) => `${scope} ${part}`)
              .join(', '),
          )) {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue;
            if (style.pointerEvents === 'none' || (el as HTMLInputElement).disabled) continue;
            if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth)
              continue;
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            const reach = finger / 2 - 1;
            // only the axis that is short is probed; a point that lands on another control is that control's own space
            const points: [number, number][] = [];
            if (box.height < finger - 0.5) points.push([cx, cy - reach], [cx, cy + reach]);
            if (box.width < finger - 0.5) points.push([cx - reach, cy], [cx + reach, cy]);
            for (const [x, y] of points) {
              if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
              const hit = document.elementFromPoint(x, y);
              if (hit && (el.contains(hit) || hit.closest(selector))) continue;
              // a gap of a few pixels between two stacked controls is the pair's shared boundary
              const [dx, dy] = [Math.sign(x - cx) * 4, Math.sign(y - cy) * 4];
              const beyond = document.elementFromPoint(x + dx, y + dy);
              if (beyond?.closest(selector)) continue;
              bad.push(
                `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(box.width)}x${Math.round(box.height)} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20)}"`,
              );
              break;
            }
          }
          return bad;
        },
        [INTERACTIVE, FINGER, within] as [string, number, string],
      );
      for (const item of found) misses.add(`${label}: ${item}`);
    };
    const flat = await open(browser, layout, '2d');
    for (const view of VIEWS) {
      await show(flat.page, view, flat.project);
      await probe(flat.page, view);
    }
    await flat.context.close();
    const scene = await open(browser, layout, '3d');
    await show(scene.page, 'office', scene.project);
    await probe(scene.page, 'office-3d');
    const chip = scene.page.locator('.sheet-chip').first();
    if (await chip.count()) {
      await chip.tap(); // the sheet's member bar: focus, open the conversation, close
      await expect(scene.page.locator('.member-bar .icon-button').first()).toBeVisible();
      await probe(scene.page, 'member bar', '.member-bar');
      await scene.page.locator('.member-bar .icon-button').last().tap();
    }
    const opener = scene.page
      .locator('.tab[aria-expanded], .mobile-menu')
      .filter({ visible: true });
    if (await opener.count()) {
      await opener.first().click();
      await probe(scene.page, 'drawer', '.sidebar.open');
    }
    await scene.context.close();
    expect([...misses], `${layout} controls under a ${FINGER}px hit area`).toEqual([]);
  });

/**
 * The native runner shows the most in the top bar (the live link, the numbers, the emergency stop, the mode badge, pairing,
 * language and theme): at every width each control stays on the screen and none covers another (D06, D07).
 */
for (const width of [320, 390, 768, 1024, 1440, 1920])
  test(`native top bar at ${width}px keeps every control reachable and apart`, async ({
    browser,
  }) => {
    const touch = width < 800;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: touch,
      isMobile: touch && width < 500,
    });
    const page = await context.newPage();
    await signIn(page, nativeOrigin(), { session: NATIVE_SESSION });
    await expect(page.locator('.topbar-right .danger')).toBeVisible(); // the emergency stop: live mode
    const problems = await page.evaluate(() => {
      const bar = document.querySelector('.topbar')!;
      const controls = [
        ...bar.querySelectorAll<HTMLElement>(
          '.topbar-right > *, .project-picker, .brand, .add-project, .mobile-menu',
        ),
      ].filter((el) => el.getBoundingClientRect().width > 0);
      const out: string[] = [];
      for (const el of controls) {
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1)
          out.push(
            `${el.className} leaves the screen (${Math.round(r.left)}..${Math.round(r.right)})`,
          );
      }
      controls.forEach((a, i) =>
        controls.slice(i + 1).forEach((b) => {
          const x = a.getBoundingClientRect();
          const y = b.getBoundingClientRect();
          if (
            x.left < y.right - 1 &&
            y.left < x.right - 1 &&
            x.top < y.bottom - 1 &&
            y.top < x.bottom - 1
          )
            out.push(`${a.className} overlaps ${b.className}`);
        }),
      );
      if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways');
      return out;
    });
    expect(problems).toEqual([]);
    // the language and theme buttons are reachable where there is room for them
    if (width >= 768)
      for (const name of [/^(介面語言|Language)$/, /^(介面外觀|Appearance)$/])
        await expect(page.getByRole('button', { name })).toBeInViewport();
    await context.close();
  });

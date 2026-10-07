import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

/**
 * One role, one height: the same kind of control must not be drawn at a different size on every page. Each role is
 * measured on the 14 views at three layouts (desktop with a mouse; a phone and a tablet with a finger) and the number
 * of distinct heights per role may not pass its limit. The sizes come from the control scale in tokens.css
 * (--control-h-sm/md/lg), so a new one-off height fails here instead of drifting back in.
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

/**
 * Chrome that belongs to a later track of the UI consistency programme is measured by that track, not here:
 * the 3D scene toolbar and HUD and the scene overlays (track D); the session panel, feed, squad and composer
 * (track E); the phone tab bar, drawer and sheet (track F); quick open (track E).
 */
const LATER_TRACKS = [
  '.scene-toolbar, .phone-top, .scene-options, .scene-hud, .hud-tools, .office-stage, .character-menu',
  '.session-panel, .session-feed, .composer, .squad, .squad-strip',
  '.tabbar, .quick-prefs, .phone-sheet, .sheet, .drawer',
  '.quick-open',
].join(', ');

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
  segmented: { selector: '.u-segmented button, .view-switch button', limit: 1 },
};

for (const [layout, { viewport, touch }] of Object.entries(LAYOUTS))
  test(`${layout}: each role keeps to its heights on the ${VIEWS.length} views`, async ({
    browser,
  }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch && viewport.width < 500,
    });
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({
            state: { theme: 'dark', locale: 'zh-TW', quality: 'low', view: '2d', advanced: true },
            version: 0,
          }),
        );
      } catch {
        // storage unavailable: the page still has to render
      }
    });
    const page = await context.newPage();
    await signIn(page);
    await expect(page.locator('main')).toBeVisible();
    const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
    const seen = new Map<string, Set<number>>(Object.keys(ROLES).map((role) => [role, new Set()]));
    const examples = new Map<string, string>();
    for (const view of VIEWS) {
      await page.goto(`/${view}?project=${projects[0]!.id}`);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const heights = await page.evaluate(
        ([roles, skip]) => {
          const out: Record<string, [number, string][]> = {};
          for (const [role, selector] of Object.entries(roles)) {
            out[role] = [];
            for (const el of document.querySelectorAll<HTMLElement>(selector)) {
              const box = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue;
              if (el.closest(skip)) continue;
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
        [
          Object.fromEntries(Object.entries(ROLES).map(([r, v]) => [r, v.selector])),
          LATER_TRACKS,
        ] as [Record<string, string>, string],
      );
      for (const [role, list] of Object.entries(heights))
        for (const [h, who] of list) {
          seen.get(role)!.add(h);
          examples.set(`${role}${h}`, `${view}:${who}`);
        }
    }
    const distinct = Object.fromEntries(
      [...seen].map(([role, set]) => [role, [...set].sort((a, b) => a - b)]),
    );
    const detail = (role: string) =>
      distinct[role]!.map((h) => `${h} (${examples.get(`${role}${h}`)})`).join(', ');
    for (const [role, { limit }] of Object.entries(ROLES))
      expect
        .soft(distinct[role]!.length, `${layout} ${role} heights: ${detail(role)}; limit ${limit}`)
        .toBeLessThanOrEqual(limit);
    await context.close();
  });

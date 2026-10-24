import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { frames } from '../support/settled.js';
import { signIn } from '../support/sign-in.js';

export const OUT = process.env['UX_OUT'] ?? 'evidence/ux';
/** WCAG 2.5.8 (AA): a target is at least this many CSS pixels on its short side unless it is spaced from the others. */
const MIN_TARGET = 24;
const TARGETS =
  'button, a[href], input:not([type=hidden]), select, summary, [role=button], [role=tab]';

export type Tag = {
  w: number;
  h: number;
  theme: 'light' | 'dark';
  lang: 'en' | 'zh-TW';
  reduced?: boolean;
};

export type Cell = {
  scene: string;
  viewport: string;
  theme: string;
  lang: string;
  screenshot: string;
  overflowPx: number;
  blank: boolean;
  smallTargets: string[];
  axe: { id: string; impact: string; nodes: number; target: string }[];
  errors: string[];
  /** The cell injects a failure, so the browser's own console line about it is expected. */
  expectsErrors?: boolean;
};

export const isPhoneOrTablet = (tag: Tag) => tag.w <= 1180;

export async function openContext(browser: Browser, tag: Tag): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: tag.w, height: tag.h },
    hasTouch: isPhoneOrTablet(tag),
    isMobile: tag.w <= 820,
    locale: tag.lang,
    colorScheme: tag.theme,
    reducedMotion: tag.reduced ? 'reduce' : 'no-preference',
  });
  const preferences = {
    state: {
      theme: tag.theme,
      locale: tag.lang,
      advanced: true,
      view: '3d',
      reducedMotion: Boolean(tag.reduced),
    },
    version: 1,
  };
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem('aether-ui-preferences', JSON.stringify(value));
    } catch {
      // storage can be unavailable; the page then keeps its defaults
    }
  }, preferences);
  return context;
}

export function watchErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`);
  });
}

export async function signedInPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await signIn(page);
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
  return page;
}

export async function settle(page: Page, scene: string) {
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
  if (scene.includes('office')) {
    await page
      .locator('canvas')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    await frames(page, 90);
  } else await frames(page, 20);
}

async function inspect(page: Page, touch: boolean) {
  return page.evaluate(
    ({ checkTargets, min, selector }) => {
      const root = document.documentElement;
      const main = document.querySelector('main');
      const empty = (main?.textContent ?? '').trim().length === 0;
      const small: string[] = [];
      for (const el of checkTargets ? document.querySelectorAll(selector) : []) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (el instanceof HTMLInputElement && el.closest('label')) continue;
        if (Math.min(box.width, box.height) >= min) continue;
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20);
        small.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(box.width)}x${Math.round(box.height)} "${name}"`,
        );
      }
      return {
        overflowPx: root.scrollWidth - root.clientWidth,
        blank: empty && !document.querySelector('main canvas'),
        smallTargets: small.slice(0, 8),
      };
    },
    { checkTargets: touch, min: MIN_TARGET, selector: TARGETS },
  );
}

async function seriousAxe(page: Page): Promise<Cell['axe']> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: String(v.impact),
      nodes: v.nodes.length,
      target: String(v.nodes[0]?.target.join(' ')).slice(0, 120),
    }));
}

export async function record(
  page: Page,
  scene: string,
  tag: Tag,
  errors: string[],
  expectsErrors = false,
): Promise<Cell> {
  const viewport = `${tag.w}x${tag.h}`;
  const screenshot = `${scene}-${viewport}-${tag.theme}-${tag.lang}.png`;
  await settle(page, scene);
  const found = await inspect(page, isPhoneOrTablet(tag));
  const axe = await seriousAxe(page);
  await page.screenshot({ path: `${OUT}/${screenshot}` });
  return {
    scene,
    viewport,
    theme: tag.theme,
    lang: tag.lang,
    screenshot,
    ...found,
    axe,
    errors: errors.splice(0),
    ...(expectsErrors ? { expectsErrors } : {}),
  };
}

export function writeIndex(name: string, cells: Cell[]) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index-${name}.json`, JSON.stringify(cells, null, 1));
}

import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

const PAGES = [
  'office',
  'agents',
  'tasks',
  'messages',
  'workspace',
  'terminals',
  'observations',
  'reviews',
  'approvals',
  'knowledge',
  'machines',
  'history',
  'settings',
] as const;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  return projects[0]!.id;
}

for (const theme of ['dark', 'light'] as const)
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS))
    test(`${theme} theme on ${viewportName}: every page is accessible, unclipped and not blank`, async ({
      page,
    }) => {
      test.setTimeout(240000);
      mkdirSync('evidence/screenshots', { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((value) => {
        try {
          window.localStorage.setItem(
            'aether-ui-preferences',
            JSON.stringify({
              state: { theme: value, locale: 'zh-TW', quality: 'low', view: '2d' },
              version: 0,
            }),
          );
        } catch {
          // storage unavailable: the page still has to render
        }
      }, theme);
      await page.setViewportSize(viewport);
      const projectId = await login(page);
      const failures: string[] = [];
      for (const name of PAGES) {
        await page.goto(`/${name}?project=${projectId}`);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) failures.push(`${name}: horizontal overflow ${overflow}px`);
        const blank = await page.evaluate(
          () =>
            (document.querySelector('main')?.innerText ?? '').trim().length === 0 &&
            !document.querySelector('main canvas'),
        );
        if (blank) failures.push(`${name}: blank`);
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        for (const v of axe.violations)
          failures.push(`${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
        await page.screenshot({
          path: `evidence/screenshots/sweep-${name}-${viewportName}-${theme}.png`,
        });
      }
      expect(failures).toEqual([]);
      expect(errors).toEqual([]);
    });

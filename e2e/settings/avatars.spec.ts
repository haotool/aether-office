import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  return projects[0]!.id;
}

for (const theme of ['dark', 'light'] as const)
  test(`${theme} theme: member portraits render, keep their size and pass axe`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({ state: { theme: value, locale: 'zh-TW', view: '2d' }, version: 0 }),
        );
      } catch {
        // storage unavailable: the page still has to render
      }
    }, theme);
    const projectId = await login(page);
    for (const route of ['office', 'agents']) {
      await page.goto(`/${route}?project=${projectId}`);
      await page.waitForLoadState('networkidle');
      const portraits = page.locator('main .avatar-icon');
      expect(await portraits.count()).toBeGreaterThan(0);
      const facts = await portraits.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const img = node.querySelector('img')!;
          return {
            hidden: node.getAttribute('aria-hidden'),
            loaded: img.complete && img.naturalWidth > 0,
            square: Math.abs(box.width - box.height) < 0.5,
            wide: box.width,
          };
        }),
      );
      for (const f of facts) {
        expect(f).toMatchObject({ hidden: 'true', loaded: true, square: true });
        expect(f.wide).toBeGreaterThanOrEqual(28);
      }
      const axe = await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(axe.violations.map((v) => v.id)).toEqual([]);
    }
  });

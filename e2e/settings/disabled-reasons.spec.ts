import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from '../support/sign-in.js';

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

type Off = { control: string; reason: string | null };

async function disabledControls(page: Page): Promise<Off[]> {
  return page.evaluate(() => {
    const out: { control: string; reason: string | null }[] = [];
    const off = document.querySelectorAll<HTMLElement>(
      'button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"]',
    );
    for (const el of off) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      const text = ids
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      out.push({
        control: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`,
        reason: text || null,
      });
    }
    return out;
  });
}

async function walk(page: Page, role: string, project: string) {
  for (const view of PAGES) {
    await page.goto(`/${view}?project=${project}`);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const unexplained = (await disabledControls(page)).filter((c) => !c.reason);
    expect(unexplained, `${role} on /${view}`).toEqual([]);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
      `axe, ${role} on /${view}`,
    ).toEqual([]);
  }
}

async function firstProject(page: Page) {
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  return projects[0]!.id;
}

test('as the owner, every disabled control on the main pages explains itself', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  await walk(page, 'owner', await firstProject(page));
});

test('as a viewer, every disabled control on the main pages explains itself', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const project = await firstProject(page);
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { actor: { id: 'v', role: 'viewer', projectIds: ['*'] }, mode: 'demo' },
    }),
  );
  await page.reload();
  await walk(page, 'viewer', project);
});

test('a viewer’s Create task button is off and its accessible description gives the reason', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { actor: { id: 'v', role: 'viewer', projectIds: ['*'] }, mode: 'demo' },
    }),
  );
  await page.reload();
  await page.getByRole('link', { name: /^任務/ }).click();
  const create = page.getByRole('button', { name: '建立任務', exact: true });
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription(/只能檢視/);
});

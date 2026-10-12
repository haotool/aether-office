import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

// Squads of every shape in the panel. The session list is the real server's, with the fixture session's subagents (and,
// for one test, its hook) replaced in the response: a synthetic squad, never a real session.
type Sub = Record<string, unknown>;
type Wire = { sessions: Record<string, unknown>[] };
const KEY = 'claude:e2e-session';

const sub = (id: string, over: Sub = {}, now = Date.now()): Sub => ({
  id,
  type: 'Explore',
  lastSeen: now - 2000,
  source: 'hook',
  status: 'running',
  startedAt: now - 90_000,
  endedAt: null,
  nickname: null,
  tools: { count: 7, last: 'Read', lastAt: now - 2000 },
  ...over,
});

async function mockSquad(page: Page, shape: { subagents: (now: number) => Sub[]; hook?: null }) {
  await page.route(
    (url) => url.pathname === '/api/local-sessions',
    async (route) => {
      const wire = (await (await route.fetch()).json()) as Wire;
      const now = Date.now();
      const sessions = wire.sessions.map((s) =>
        s['key'] !== KEY
          ? s
          : {
              ...s,
              subagents: shape.subagents(now),
              ...(shape.hook === null ? { hook: null, process: 'running', mtime: now } : {}),
            },
      );
      await route.fulfill({ json: { ...wire, sessions } });
    },
  );
}

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  const option = page.locator('.project-picker select option', { hasText: 'fixture-repo' });
  await expect(option).toBeAttached({ timeout: 15000 });
  const projects = (await (await page.request.get('/api/projects')).json()) as {
    id: string;
    name: string;
  }[];
  return projects.find((p) => p.name === 'fixture-repo')!.id;
}

async function expectAccessible(page: Page, scope: string) {
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    const { violations } = await new AxeBuilder({ page })
      .include(scope)
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(violations, `${scope} ${theme}`).toEqual([]);
  }
  await page.evaluate(() => (document.documentElement.dataset['theme'] = 'dark'));
}

const busy = (now: number) => [
  sub('w1', { type: 'code-reviewer', status: 'waiting_permission' }, now),
  sub('r1', { type: 'general-purpose', nickname: null }, now),
  sub('r2', { type: 'Explore' }, now),
  sub('c1', { type: 'worker', source: 'rollout', nickname: 'Hubble', tools: null }, now),
  sub('f1', { type: 'Plan', status: 'finished', endedAt: now - 20_000 }, now),
  sub('f2', { type: 'Plan', status: 'finished', endedAt: now - 75_000 }, now),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('a mixed squad: waiting first, finished last and fading, no tool count where none is counted, accessible', async ({
  page,
}) => {
  await mockSquad(page, { subagents: busy });
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  const rows = panel.getByRole('treeitem', { level: 2 });
  await expect(rows).toHaveCount(6, { timeout: 15000 });
  await expect(rows.first()).toHaveAttribute('data-status', 'waiting_permission');
  await expect(rows.first()).toContainText(/等待批准/);
  await expect(panel.locator('.squad-chip')).toContainText('6');
  await expect(panel.locator('.squad-chip')).toContainText(/等待批准/);
  await expect(rows.last()).toHaveAttribute('data-status', 'finished');
  await expect(rows.last()).toHaveAttribute('data-fading', 'true');
  await expect(rows.nth(-2)).not.toHaveAttribute('data-fading', /.+/);
  const codex = rows.filter({ hasText: 'Hubble' });
  await expect(codex).toContainText('worker · Hubble');
  await expect(codex).not.toContainText('工具呼叫');
  await expect(rows.filter({ hasText: 'general-purpose' })).toContainText('7');
  await expectAccessible(page, '.session-panel');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-mixed.png' });

  await panel.locator('[role="treeitem"][aria-level="1"]').click();
  await expect(panel.locator('.squad-chip-button')).toHaveCount(6);
  await panel.locator('.squad-chip-button', { hasText: 'Hubble' }).click();
  const card = panel.locator('.sub-card[open]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Hubble');
  await expect(card.locator('.sub-calls')).toHaveCount(0);
  await expectAccessible(page, '.session-panel');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-mixed-conversation.png' });
});

test('thirty subagents: folded to a header, one toggle opens them, and toggling stays quick', async ({
  page,
}) => {
  await mockSquad(page, {
    subagents: (now) =>
      Array.from({ length: 30 }, (_, i) => sub(`s${i}`, { type: `Agent ${i}` }, now)),
  });
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  const parent = panel.locator('[role="treeitem"][aria-level="1"]');
  await expect(parent).toHaveAttribute('aria-expanded', 'false', { timeout: 15000 });
  await expect(panel.locator('.squad-chip')).toHaveText('30 個子代理 · 30 個執行中');
  await expect(panel.getByRole('treeitem', { level: 2 })).toHaveCount(0);
  await panel.locator('.squad-toggle').click();
  await expect(panel.getByRole('treeitem', { level: 2 })).toHaveCount(30);
  const spent = await page.evaluate(async () => {
    const toggle = document.querySelector<HTMLElement>('.squad-toggle')!;
    const start = performance.now();
    for (let i = 0; i < 4; i++) {
      toggle.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return (performance.now() - start) / 4;
  });
  expect(spent).toBeLessThan(250);
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-thirty.png' });
});

test('a finished squad is dimmed and its rows open the supervisor; the live region tells of new subagents once', async ({
  page,
}) => {
  let phase: 'done' | 'more' = 'done';
  await mockSquad(page, {
    subagents: (now) =>
      phase === 'done'
        ? [sub('d1', { status: 'finished', endedAt: now - 10_000 }, now)]
        : [
            sub('d1', { status: 'finished', endedAt: now - 10_000 }, now),
            sub('n1', {}, now),
            sub('n2', {}, now),
          ],
  });
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  await expect(panel.locator('.squad-chip')).toContainText('全部完成', { timeout: 15000 });
  const live = panel.locator('[aria-live="polite"]');
  await expect(live).toHaveText('');
  await panel.getByRole('treeitem', { level: 2 }).click();
  await expect(page).not.toHaveURL(/%3Asub%3A/);
  await expect(panel.locator('.sub-card')).toHaveCount(1);
  await panel
    .getByRole('button', { name: /列表|全部 session/ })
    .first()
    .click();
  phase = 'more';
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(live).toContainText('2 個子代理已開始', { timeout: 20000 });
  await expect(live).not.toContainText('已完成');
});

test('a Claude session working without the hook says why its squad is invisible, with the command to copy', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockSquad(page, { subagents: () => [], hook: null });
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  await panel.locator('.feed-row').click({ timeout: 15000 });
  const note = panel.locator('.hook-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('pnpm hooks install --project');
  await expect(panel.getByRole('tree')).toHaveCount(0);
  await expectAccessible(page, '.session-panel');
  await note.getByRole('button').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('pnpm hooks install');
  await page.screenshot({ path: 'evidence/screenshots/e2e-squad-hook-note.png' });
});

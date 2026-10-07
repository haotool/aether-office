import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frames } from './support/settled.js';

// The office-life follow-ups: R21 and R43 (docs/design/office-life.md section 5.3), the looped preview that the perf matrix
// measures motion with, and the first-appearance shader warm-up of the squad layer (no program is linked when a squad shows).
const LOG = '[role="log"]';

async function open(page: Page, path: string, seed: { quality?: string; theme?: string } = {}) {
  await page.addInitScript(
    (state) => {
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.setItem('aether-ui-preferences', JSON.stringify({ state, version: 0 }));
    },
    { theme: 'dark', locale: 'en', view: '3d', autoCamera: false, panelCollapsed: true, ...seed },
  );
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel(/access token|存取權杖/i)
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await expect(page.getByLabel(/access token|存取權杖/i)).toBeHidden();
  await page.goto(path);
}

async function scenario(browser: Browser, path: string, seed: { quality?: string } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await open(page, path, seed);
  return { page, close: () => context.close() };
}

const logText = (page: Page) => page.locator(LOG).allInnerTexts();
// `legacy=1`: no squad zones, so the fixture subagent's own join is not said ahead of the effect in the shared log.
const preview = (effect: string, extra = '') =>
  `/office?preview=life&effect=${effect}&t=1000&legacy=1${extra}`;

test.describe('R21 and R43', () => {
  test('a TODO search is announced once', async ({ page }) => {
    await open(page, preview('todo-notes'));
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    expect((await logText(page)).join(' ')).toMatch(/is looking for TODOs/);
  });

  test('the time machine shows on the high tier and says it only started; the balanced tier is silent', async ({
    browser,
  }) => {
    const high = await scenario(browser, preview('time-machine'), { quality: 'high' });
    await expect(high.page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    expect((await logText(high.page)).join(' ')).toMatch(
      /started a hard reset of the working tree/,
    );
    await high.close();
    const balanced = await scenario(browser, preview('time-machine'), { quality: 'balanced' });
    await balanced.page.waitForTimeout(4000); // a negative wait: the tier says nothing, so there is nothing to wait for; this is longer than the high tier's effect took to show
    await expect(balanced.page.locator(`${LOG} p`)).toHaveCount(0);
    await balanced.close();
  });

  test('speaks Traditional Chinese for a Chinese page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme: 'dark',
            locale: 'zh-TW',
            view: '3d',
            autoCamera: false,
            panelCollapsed: true,
          },
          version: 0,
        }),
      );
    });
    const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
      directory: string;
    };
    await page.goto('/');
    await page
      .getByLabel(/access token|存取權杖/i)
      .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
    await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
    await expect(page.getByLabel(/access token|存取權杖/i)).toBeHidden();
    await page.goto(preview('todo-notes'));
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    expect((await logText(page)).join(' ')).toMatch(/正在搜尋待辦註記/);
    await context.close();
  });
});

test.describe('the looped preview', () => {
  test('plays the effect on past one loop and is still announced once', async ({ page }) => {
    await open(page, preview('ci-pass', '&loop=1'));
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(3500); // a negative wait, past one loop of a 3.2 s effect: it must not be announced a second time
    await expect(page.locator(`${LOG} p`)).toHaveCount(1);
  });
});

test.describe('the squad layer is warm before the first subagent shows', () => {
  test('a squad that appears late links no new shader program', async ({ page }) => {
    await open(page, '/office?perf=60&squad=3&after=6000');
    await page.waitForFunction(() => '__aetherPerfRig' in window, undefined, { timeout: 60_000 });
    await frames(page, 180); // the warm-up has linked what the scene holds (scene time, so a loaded machine only waits longer)
    const before = await page.evaluate(
      () =>
        (window as unknown as { __aetherPerfRig: { gl: { info: { programs: unknown[] } } } })
          .__aetherPerfRig.gl.info.programs.length,
    );
    // The squad shows 6 s after load (`after=6000`, a page timer) and nothing in the DOM marks it, so this is a time wait.
    await page.waitForTimeout(12_000); // the squad has shown, its zone, pods, beam and strings drawn
    const after = await page.evaluate(() => {
      const rig = (
        window as unknown as {
          __aetherPerfRig: {
            sample: (n: number) => Promise<unknown>;
            gl: { info: { programs: unknown[] } };
          };
        }
      ).__aetherPerfRig;
      return rig.sample(30).then(() => rig.gl.info.programs.length);
    });
    expect(after).toBe(before);
  });
});

for (const theme of ['dark', 'light'] as const)
  test(`the office with a looped life preview has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await open(page, preview('todo-notes,ci-pass', '&loop=1'), { theme });
    await expect(page.locator(`${LOG} p`)).not.toHaveCount(0, { timeout: 30_000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

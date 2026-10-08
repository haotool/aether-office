import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { FIELD_PERF_SCHEMA } from '../../packages/office-scene/src/field/field-perf-report.js';

const fieldPerfChunk = /\/assets\/FieldPerfPanel-[^/]+\.js/;

test.describe('field perf report', () => {
  test('does not load the panel without ?fieldperf=1', async ({ page }) => {
    const chunkLoads: string[] = [];
    page.on('request', (req) => {
      if (fieldPerfChunk.test(req.url())) chunkLoads.push(req.url());
    });
    await signIn(page, '/');
    await page.waitForLoadState('networkidle');
    expect(await page.locator('.field-perf').count()).toBe(0);
    expect(chunkLoads).toEqual([]);
  });

  test('does not load the field panel when only ?perf=1 (scene rig)', async ({ page }) => {
    const chunkLoads: string[] = [];
    page.on('request', (req) => {
      if (fieldPerfChunk.test(req.url()) || /\/assets\/load-[^/]+\.js/.test(req.url())) {
        chunkLoads.push(req.url());
      }
    });
    await signIn(page, '/?perf=1');
    await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 60_000 });
    expect(await page.locator('.field-perf').count()).toBe(0);
    expect(chunkLoads).toEqual([]);
  });

  test('shows the panel and copies a schema-valid JSON report', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page, '/?fieldperf=1&perf=1');
    await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 60_000 });
    const panel = page.locator('.field-perf');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('button', { name: /copy report|複製報告/i })).toBeDisabled();
    await page.waitForFunction(
      () =>
        !!document.querySelector('.field-perf__copy:not(:disabled)') ||
        document.querySelector('.field-perf__meta')?.textContent?.includes('Ready') ||
        document.querySelector('.field-perf__meta')?.textContent?.includes('可以複製'),
      undefined,
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /copy report|複製報告/i }).click();
    await expect(page.locator('.field-perf [role="status"]')).toContainText(
      /Report copied|報告已複製到剪貼簿/i,
    );
    await page.waitForFunction(async () => {
      try {
        const text = await navigator.clipboard.readText();
        return text.includes(FIELD_PERF_SCHEMA);
      } catch {
        return !!document.querySelector('.field-perf__textarea');
      }
    });
    const fromClipboard = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return (
          (document.querySelector('.field-perf__textarea') as HTMLTextAreaElement | null)?.value ??
          ''
        );
      }
    });
    const parsed = JSON.parse(fromClipboard) as {
      schema: string;
      frames: { sampleCount: number };
      scene: { drawCalls: number | null };
    };
    expect(parsed.schema).toBe(FIELD_PERF_SCHEMA);
    expect(parsed.frames.sampleCount).toBeGreaterThan(0);
    const scene = parsed.scene;
    expect(scene.drawCalls).toBeGreaterThan(0);
  });

  test('captures maintainer evidence screenshots', async ({ page }) => {
    const dir = process.env.FIELD_PERF_EVIDENCE_DIR;
    test.skip(!dir, 'set FIELD_PERF_EVIDENCE_DIR to write PNGs');
    const cases = [
      ['phone', 390, 844],
      ['tablet', 768, 1024],
      ['desktop', 1440, 900],
    ] as const;
    for (const locale of ['en', 'zh-TW'] as const) {
      for (const theme of ['dark', 'light'] as const) {
        for (const [tag, width, height] of cases) {
          await page.context().clearCookies();
          await page.goto('about:blank');
          await page.addInitScript(
            ({ loc, th }) => {
              window.localStorage.setItem(
                'aether-ui-preferences',
                JSON.stringify({
                  state: {
                    locale: loc,
                    theme: th,
                    quality: 'balanced',
                    view: '3d',
                    intro: 'never',
                  },
                  version: 0,
                }),
              );
            },
            { loc: locale, th: theme },
          );
          await page.emulateMedia({ colorScheme: theme });
          await page.setViewportSize({ width, height });
          await signIn(page, '/?fieldperf=1');
          await expect(page.locator('.field-perf')).toBeVisible({ timeout: 30_000 });
          await page.screenshot({
            path: `${dir}/field-perf-${locale}-${theme}-${tag}.png`,
          });
        }
      }
    }
  });
});

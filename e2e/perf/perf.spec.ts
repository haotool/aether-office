import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { mkdirSync, writeFileSync } from 'node:fs';

// Measures, never asserts a frame-rate target: the report records what this machine actually did.
test('the opt-in perf probe reports measured frame times with the renderer that produced them', async ({
  page,
}) => {
  await signIn(page, '/?perf=1');
  await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 30000 });
  const report = await page.evaluate(
    () => (window as unknown as { __aetherPerf: unknown }).__aetherPerf,
  );
  expect(report).toMatchObject({ stats: { frames: 120 }, quality: expect.any(String) });
  const measured = report as {
    stats: { medianMs: number; p99Ms: number };
    programs: number;
    gpuMegabytes: number;
    jsMs: { median: number };
  };
  expect(measured.stats.medianMs).toBeGreaterThan(0);
  expect(measured.stats.p99Ms).toBeGreaterThanOrEqual(measured.stats.medianMs);
  expect(measured.programs).toBeGreaterThan(0);
  expect(measured.gpuMegabytes).toBeGreaterThan(0);
  expect(measured.jsMs.median).toBeGreaterThan(0);
  mkdirSync('evidence', { recursive: true });
  writeFileSync(
    'evidence/perf-report.json',
    JSON.stringify(
      {
        ...(report as object),
        browser: 'headless Chrome via Playwright',
        note: 'Measured, not a target claim',
      },
      null,
      2,
    ),
  );
});

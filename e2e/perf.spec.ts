import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Measures, never asserts a frame-rate target: the report records what this machine actually did.
test('the opt-in perf probe reports measured frame times with the renderer that produced them', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/?perf=1');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
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

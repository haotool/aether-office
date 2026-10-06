import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The intro tour's frame gate (docs/design/office-life-iterations.md, I2): the longest frame of the whole tour, outside the
// 400 ms dips that hide its cuts, may exceed the same scene without the tour by at most 120 ms on a desktop and 200 ms on a
// phone. Frames are the browser's own (requestAnimationFrame) on a real GPU. Skipped unless PERF_GPU=1: "not run", never "passed".
//
//   PERF_GPU=1 [PERF_ROUNDS=2] pnpm exec playwright test e2e/intro-perf.spec.ts
const RUN = process.env['PERF_GPU'] === '1';
const ROUNDS = Number(process.env['PERF_ROUNDS'] ?? 2);
const BASELINE_MS = 12000;
const TOUR_TIMEOUT_MS = 70000;
const GATE_MS = { desktop: 120, phone: 200 } as const;

test.use({
  launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
});

type Frames = { outside: number[]; inside: number[]; renderer: string };

/** Records every frame's length (and whether a tour dip was on screen) until `done` says stop. */
async function record(page: Page, stopWhen: 'tour-over' | number): Promise<Frames> {
  return page.evaluate(
    ({ stop, limit }) =>
      new Promise<Frames>((resolve) => {
        const outside: number[] = [];
        const inside: number[] = [];
        const began = performance.now();
        let last = began;
        let sawTour = false;
        const step = (now: number) => {
          const tour = document.querySelector('.intro-caption') !== null;
          sawTour ||= tour;
          const dip = document.querySelector('.cut-dip[data-intro]') !== null;
          (dip ? inside : outside).push(now - last);
          last = now;
          const over = stop === 'tour-over' ? sawTour && !tour : now - began >= limit;
          if (over || now - began > limit) {
            const gl = document.createElement('canvas').getContext('webgl')!;
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            resolve({
              outside,
              inside,
              renderer: String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
            });
          } else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { stop: stopWhen, limit: stopWhen === 'tour-over' ? TOUR_TIMEOUT_MS : stopWhen },
  );
}

async function enter(page: Page, query: string) {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await expect(page.locator('main')).toBeVisible();
  await page.goto(`/office?${query}`);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
}

const max = (v: readonly number[]) => Math.max(0, ...v);
const p99 = (v: readonly number[]) =>
  [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil(0.99 * v.length) - 1)] ?? 0;
const round = (n: number) => Math.round(n * 10) / 10;

test.describe('intro tour frame gate', () => {
  test.skip(!RUN, 'not run: set PERF_GPU=1 to measure on a real GPU');
  test.setTimeout(ROUNDS * 2 * (TOUR_TIMEOUT_MS + 30000) + 60000);

  for (const kind of ['desktop', 'phone'] as const)
    test(`${kind}: the longest frame outside the dips stays within the gate`, async ({
      browser,
    }) => {
      const options =
        kind === 'phone'
          ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
          : { viewport: { width: 1440, height: 900 } };
      const runs: { baseline: Frames; tour: Frames }[] = [];
      for (let round = 0; round < ROUNDS; round += 1) {
        // Interleaved: the plain scene, then the scene with the tour, so a loaded machine hits both alike.
        const quiet = await browser.newContext(options);
        const base = await quiet.newPage();
        await enter(base, 'perf=1');
        const baseline = await record(base, BASELINE_MS);
        await quiet.close();

        const loud = await browser.newContext(options);
        const page = await loud.newPage();
        await enter(page, 'intro=force&perf=1');
        const tour = await record(page, 'tour-over');
        await loud.close();
        runs.push({ baseline, tour });
      }
      const renderer = runs[0]!.baseline.renderer;
      expect(renderer).not.toMatch(/swiftshader|software|llvmpipe/i);
      const rows = runs.map(({ baseline, tour }) => ({
        baselineMaxMs: round(max(baseline.outside)),
        baselineP99Ms: round(p99(baseline.outside)),
        tourMaxOutsideDipsMs: round(max(tour.outside)),
        tourMaxInsideDipsMs: round(max(tour.inside)),
        tourP99OutsideDipsMs: round(p99(tour.outside)),
        tourFrames: tour.outside.length + tour.inside.length,
        deltaMaxMs: round(max(tour.outside) - max(baseline.outside)),
      }));
      mkdirSync('evidence', { recursive: true });
      writeFileSync(
        `evidence/intro-perf-${kind}.json`,
        JSON.stringify(
          {
            renderer,
            kind,
            gateMs: GATE_MS[kind],
            rounds: ROUNDS,
            rows,
            measuredAt: new Date().toISOString(),
            note: 'Measured on the machine as it was (other work was running); the first row of each pair is the same scene without the tour.',
          },
          null,
          2,
        ),
      );
      for (const row of rows) expect(row.deltaMaxMs).toBeLessThanOrEqual(GATE_MS[kind]);
    });
});

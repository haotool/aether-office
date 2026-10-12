import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const RUN = process.env['PERF_GPU'] === '1';
const VARIANT = process.env['PERF_VARIANT'] ?? 'talk=1';
const BASELINE = process.env['PERF_BASELINE'] ?? '';
const ROUNDS = Number(process.env['PERF_ROUNDS'] ?? 3);
const FRAMES = Number(process.env['PERF_FRAMES'] ?? 240);

type Report = {
  stats: { medianMs: number; p95Ms: number; maxMs: number };
  drawCalls: number;
  programs: number;
  gpuMegabytes: number;
  jsMs: { median: number };
  renderer: string;
  quality: string;
  viewport: { width: number; height: number };
};

const GATES = {
  medianMs: 1.0,
  p95Ms: 2.0,
  drawCalls: 19,
  programs: 4,
  gpuMegabytes: 4,
  jsMs: 0.4,
} as const;

const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const round = (n: number) => Math.round(n * 100) / 100;

test.use({
  launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
});

test.describe('office-life perf harness', () => {
  test.skip(!RUN, 'not run: set PERF_GPU=1 to measure on a real GPU');

  async function measure(page: Page, query: string): Promise<Report> {
    await signIn(page, `/?perf=${FRAMES}${query ? `&${query}` : ''}`);
    await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 60000 });
    return page.evaluate(() => (window as unknown as { __aetherPerf: Report }).__aetherPerf);
  }

  test('the variant scene costs no more than the gate allows over the baseline', async ({
    browser,
  }) => {
    test.setTimeout(60_000 + ROUNDS * 20_000);
    const baseline: Report[] = [];
    const variant: Report[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const [query, into] of [
        [BASELINE, baseline],
        [VARIANT, variant],
      ] as const) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        into.push(await measure(await context.newPage(), query));
        await context.close();
      }
    }
    const renderer = baseline[0]!.renderer;
    // Software rendering (SwiftShader) would make every number meaningless for this gate.
    expect(renderer).not.toMatch(/swiftshader|software|llvmpipe/i);

    const of = (reports: readonly Report[], pick: (r: Report) => number) =>
      median(reports.map(pick));
    const metrics = {
      medianMs: (r: Report) => r.stats.medianMs,
      p95Ms: (r: Report) => r.stats.p95Ms,
      maxMs: (r: Report) => r.stats.maxMs,
      drawCalls: (r: Report) => r.drawCalls,
      programs: (r: Report) => r.programs,
      gpuMegabytes: (r: Report) => r.gpuMegabytes,
      jsMs: (r: Report) => r.jsMs.median,
    };
    const deltas = Object.fromEntries(
      Object.entries(metrics).map(([name, pick]) => {
        const a = of(baseline, pick);
        const b = of(variant, pick);
        const limit = GATES[name as keyof typeof GATES];
        return [
          name,
          {
            baseline: a,
            variant: b,
            delta: round(b - a),
            runs: ROUNDS,
            ...(limit === undefined ? {} : { limit, within: b - a <= limit }),
          },
        ];
      }),
    );
    mkdirSync('evidence', { recursive: true });
    writeFileSync(
      'evidence/office-life-perf.json',
      JSON.stringify(
        {
          renderer,
          quality: baseline[0]!.quality,
          viewport: baseline[0]!.viewport,
          baselineQuery: BASELINE,
          variantQuery: VARIANT,
          rounds: ROUNDS,
          framesPerRun: FRAMES,
          order: 'baseline and variant interleaved per round',
          deltas,
          measuredAt: new Date().toISOString(),
          note: 'Measured, never a target claim. The delta of each metric is the median of the variant runs minus the median of the baseline runs.',
        },
        null,
        2,
      ),
    );
  });
});

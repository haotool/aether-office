import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  SCHEMA,
  DEFAULT_THRESHOLDS,
  aggregateByCase,
  deltaBvsA,
  noiseFloor,
  evaluatePass,
  isLoadValid,
  resolveLoadValidity,
} from './stats.ts';
import { collectEnvMeta, readLoadAverage, waitForQuietLoad } from './env.ts';
import { flags } from './flags.ts';
import { measureCaseRound, profileSettings } from './measure.ts';
import { renderMarkdown, assertSchema } from './render-summary.ts';

const args = flags(process.argv.slice(2).filter((a) => a !== '--'));
const aa = Boolean(args.aa);
const urlA = String(args['url-a'] ?? args.urlA ?? '');
const urlB = aa ? urlA : String(args['url-b'] ?? args.urlB ?? '');
const tokenA = String(args['token-a'] ?? '.data/e2e-session.json');
const tokenB = aa ? tokenA : String(args['token-b'] ?? tokenA);
const rounds = Number(args.rounds ?? 8);
const frames = Number(args.frames ?? 240);
const profile = String(args.profile ?? 'M-MID');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outDir =
  typeof args.out === 'string' ? resolve(root, args.out) : join(root, 'evidence/mobile-perf');
const loadWaitMin = Number(args['load-wait-min'] ?? 5);
const smoke = Boolean(args.smoke);
const quality = 'balanced';

if (!urlA || !urlB) {
  console.error(
    'usage: --url-a URL --token-a file [--url-b URL --token-b file] [--aa] [--rounds N] [--out dir]',
  );
  process.exit(64);
}

const settings = profileSettings(profile);
const cases = [
  { id: 'A', url: urlA, tokenFile: tokenA },
  { id: 'B', url: urlB, tokenFile: tokenB },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

type RoundRow = {
  index: number;
  caseId: string;
  load1min: number;
  uptimeLine: string;
  valid: boolean;
  invalidReason?: string;
  metrics: Record<string, number> | null;
};

const roundRows: RoundRow[] = [];
let renderer = '';
for (let r = 0; r < rounds; r += 1) {
  const order = r % 2 === 0 ? cases : [...cases].reverse();
  for (const c of order) {
    const load = readLoadAverage();
    const waited = isLoadValid(load.load1min)
      ? { load1min: load.load1min, timedOut: false }
      : await waitForQuietLoad(loadWaitMin);
    const gate = resolveLoadValidity(load.load1min, waited);
    const valid = gate.valid;
    let payload: Awaited<ReturnType<typeof measureCaseRound>> | null = null;
    if (valid) {
      payload = await measureCaseRound(browser, {
        baseUrl: c.url,
        tokenFile: c.tokenFile,
        frames,
        settings,
        quality,
      });
      renderer = payload.renderer;
    }
    roundRows.push({
      index: r,
      caseId: c.id,
      load1min: load.load1min,
      uptimeLine: load.uptimeLine,
      valid,
      ...(valid ? {} : { invalidReason: gate.invalidReason }),
      metrics: payload?.metrics ?? null,
    });
  }
}
await browser.close();

const flat = roundRows
  .filter(
    (row): row is RoundRow & { metrics: Record<string, number> } =>
      row.valid && row.metrics !== null,
  )
  .map((row) => ({
    index: row.index,
    caseId: row.caseId,
    metrics: row.metrics,
    valid: true as const,
  }));
const casesSummary = aggregateByCase(flat, { discardFirst: true, countInvalidLoad: false });
const delta = deltaBvsA(casesSummary.A ?? {}, casesSummary.B ?? {});
const env = {
  ...(await collectEnvMeta({
    profile,
    throttle: settings.throttle,
    viewport: { width: settings.width, height: settings.height },
    dpr: settings.dpr,
    network: settings.network,
  })),
  renderer,
};

const summary = {
  schema: SCHEMA,
  profile,
  rounds,
  discardFirst: true,
  aa,
  smoke,
  env,
  cases: casesSummary,
  delta: { BvsA: delta },
  noiseFloor: aa ? noiseFloor(delta) : undefined,
  pass: evaluatePass({ delta: { BvsA: delta } }, { ...DEFAULT_THRESHOLDS, requireRelative: false }),
  roundLog: roundRows,
  measuredAt: new Date().toISOString(),
};
assertSchema(summary);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(join(outDir, 'env.json'), `${JSON.stringify(env, null, 2)}\n`);
writeFileSync(join(outDir, 'summary.md'), `${renderMarkdown(summary)}\n`);
console.log(JSON.stringify({ outDir, renderer, pass: summary.pass }, null, 2));

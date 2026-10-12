import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { assertHardwareRenderer, readLoadAverage, readTokenFile, sleep } from './env.ts';
import { profileSettings } from './measure.ts';
import { enterOfficeAndWaitProbe, openMeasurePage } from './measure-page.ts';
import { readHarnessSamples } from './measure-probe.ts';

const SAMPLE_EVERY_MS = 30_000;
const MIB = 1024 * 1024;
const COUNT_GL_CONTEXTS = `(() => {
  const seen = new WeakSet();
  window.__aetherGlContexts = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/.test(String(type)) && !seen.has(this)) {
      seen.add(this);
      window.__aetherGlContexts += 1;
    }
    return getContext.call(this, type, ...rest);
  };
})();`;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    url: { type: 'string' },
    'token-file': { type: 'string' },
    out: { type: 'string' },
    'soak-min': { type: 'string', default: '10' },
  },
});
const { url, out } = values;
const tokenFile = values['token-file'];
if (!url || !tokenFile || !out) {
  console.error('usage: --url <base> --token-file <file> --out <raw.json> [--soak-min 10]');
  process.exit(64);
}
const soakMin = Number(values['soak-min']);
const { token } = readTokenFile(tokenFile);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const session = await openMeasurePage(browser, profileSettings('M-MID'), 'balanced');
await session.page.addInitScript(COUNT_GL_CONTEXTS);
await enterOfficeAndWaitProbe(session.page, url, 240, token);
const { probe } = await readHarnessSamples(session.page);
if (!probe) throw new Error('__aetherPerf is missing');
assertHardwareRenderer(probe.renderer);
const page = await session.page.evaluate(() => {
  const entries = [
    ...performance.getEntriesByType('navigation'),
    ...performance.getEntriesByType('resource'),
  ] as PerformanceResourceTiming[];
  return {
    glContexts: Number(Reflect.get(window, '__aetherGlContexts')),
    transferBytes: entries.reduce((sum, e) => sum + e.transferSize, 0),
  };
});

const cdp = await session.context.newCDPSession(session.page);
await cdp.send('HeapProfiler.enable');
const heapMegabytes: number[] = [];
for (let t = 0; t <= soakMin * 60_000; t += SAMPLE_EVERY_MS) {
  if (t > 0) await sleep(SAMPLE_EVERY_MS);
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  heapMegabytes.push(Math.round((usedSize / MIB) * 10) / 10);
}
await browser.close();

// The first minute is warm-up (scene assets, query cache); growth is counted from there.
const baseline = heapMegabytes[Math.min(2, heapMegabytes.length - 1)] ?? 0;
const last = heapMegabytes[heapMegabytes.length - 1] ?? 0;
const growthPct = baseline > 0 ? Math.round(((last - baseline) / baseline) * 1000) / 10 : 0;
writeFileSync(
  out,
  `${JSON.stringify(
    {
      profile: 'M-MID',
      renderer: probe.renderer,
      load1min: readLoadAverage().load1min,
      scene: {
        drawCalls: probe.drawCalls,
        triangles: probe.triangles,
        gpuMegabytes: probe.gpuMegabytes,
        webglContexts: page.glContexts,
      },
      coldStart: { transferBytes: page.transferBytes },
      soak: { minutes: soakMin, heapMegabytes, growthPct },
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${out}`);

// Real-GPU perf matrix: scene variants through the perf probe on one device profile, interleaved and repeated, medians.
//
//   node scripts/perf-matrix.mjs --url http://127.0.0.1:4320 --cases 'base=;squad=squad=8&tools=900' \
//        [--quality balanced|high|low] [--size 1440x900] [--dpr 2] [--throttle 4] [--phone] [--rounds 3] [--frames 240]
//        [--motion] [--hitch] [--token-file .data/e2e-session.json] [--out evidence/perf-matrix.json]
//
// A case is `name=query` (the query is added to `/?perf=N`). Every round mounts every case once, in turn (A, B, A, B), so a
// loaded machine hits all alike. `--phone` is the phone profile: compact layout, beanstalk off, touch. `--throttle N` slows the CPU
// N times (CDP). `--motion` samples a second time after the first report, with everything already warm and playing.
// `--hitch` records, as well, the worst frame in the seconds after mount (`--hitch-ms`, default 15000) (the shader-compile hitch of a first appearance).
// The renderer that produced the numbers is printed and written to the report; a software renderer is refused.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const flags = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : next;
  }
  return out;
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (n) => Math.round(n * 100) / 100;

const args = flags(process.argv.slice(2));
const base = typeof args.url === 'string' ? args.url : 'http://127.0.0.1:4320';
const file = typeof args['token-file'] === 'string' ? args['token-file'] : '.data/e2e-session.json';
const runtime = JSON.parse(readFileSync(file, 'utf8'));
const token = readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim();
const [width, height] = (typeof args.size === 'string' ? args.size : '1440x900')
  .split('x')
  .map(Number);
const dpr = Number(args.dpr ?? 1);
const rounds = Number(args.rounds ?? 3);
const frames = Number(args.frames ?? 240);
const throttle = Number(args.throttle ?? 1);
const HITCH_MS = Number(args['hitch-ms'] ?? 15000);
const quality = typeof args.quality === 'string' ? args.quality : 'balanced';
const cases = String(args.cases ?? 'base=')
  .split(';')
  .map((item) => {
    const at = item.indexOf('=');
    return { name: item.slice(0, at), query: item.slice(at + 1) };
  });

async function mount(browser, query) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    ...(args.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  if (!args.phone)
    // A synthetic history (the shape e2e/support/git-graph.ts answers with), so the beanstalk and its crown exist.
    await page.route('**/api/projects/*/git-graph', (route) => {
      const hex = (n) => `${n.toString(16).padStart(7, '0')}abc`;
      const commits = Array.from({ length: 150 }, (_, i) => ({
        sha: hex(150 - i),
        parents: i + 1 < 150 ? [hex(149 - i)] : [],
        refs: i === 0 ? ['main'] : [],
        subject: `Synthetic commit ${150 - i}`,
        author: i % 3 ? 'Lin' : 'Ada',
        at: Date.now() - i * 86_400_000,
        lane: 0,
        edges: i + 1 < 150 ? [{ to: 0, parent: hex(149 - i) }] : [],
      }));
      return route.fulfill({ json: { commits, lanes: 1 } });
    });
  await page.addInitScript(
    ({ q, panel }) => {
      localStorage.setItem('aether-building-panel', 'closed');
      localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme: 'dark',
            locale: 'en',
            view: '3d',
            autoCamera: false,
            advanced: true,
            panelCollapsed: true,
            quality: q,
            ...(panel ? { beanstalk: false } : {}),
          },
          version: 0,
        }),
      );
      // Frame log for --hitch: every animation frame's time, from the first one the page gets.
      const log = [];
      let last = performance.now();
      const tick = (now) => {
        log.push([now, now - last]);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__frameLog = log;
      // When the scene mounted (the perf probe appears with it): the origin of a first-appearance window.
      const watch = setInterval(() => {
        if (!window.__aetherPerfRig) return;
        window.__rigAt = performance.now();
        clearInterval(watch);
        // Every render call with its duration and the number of linked programs: a first-use compile shows as a slow call that adds one.
        const { gl } = window.__aetherPerfRig;
        const draw = gl.render.bind(gl);
        window.__renders = [];
        window.__linked = [];
        gl.render = (...call) => {
          const began = performance.now();
          const before = gl.info.programs?.length ?? 0;
          const known = new Set(gl.info.programs ?? []);
          draw(...call);
          for (const program of gl.info.programs ?? [])
            if (!known.has(program)) window.__linked.push(program.name);
          window.__renders.push([
            began,
            performance.now() - began,
            (gl.info.programs?.length ?? 0) - before,
          ]);
        };
      }, 20);
    },
    { q: quality, panel: Boolean(args.phone) },
  );
  if (throttle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  await page.goto(`${base}/?perf=${frames}${query ? `&${query}` : ''}`);
  await page.getByLabel(/access token|存取權杖/i).fill(token);
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 120000 });
  return { context, page };
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const runs = Object.fromEntries(cases.map((c) => [c.name, []]));
for (let r = 0; r < rounds; r += 1) {
  for (const c of cases) {
    const { context, page } = await mount(browser, c.query);
    const first = await page.evaluate(() => window.__aetherPerf);
    const entry = { first };
    if (args.motion) {
      await page.waitForTimeout(1500);
      entry.motion = await page.evaluate((n) => window.__aetherPerfRig.sample(n), frames);
    }
    if (args.hitch) {
      // From a second after the scene mounted (its own load settled) to HITCH_MS after it: the first appearance is inside.
      await page.waitForFunction((ms) => performance.now() > window.__rigAt + ms, HITCH_MS, {
        timeout: HITCH_MS + 60000,
      });
      const { log, from } = await page.evaluate(() => ({
        log: window.__frameLog,
        from: window.__rigAt + 1000,
      }));
      const deltas = log.filter(([t]) => t >= from && t < from + HITCH_MS).map(([, d]) => d);
      const renders = (await page.evaluate(() => window.__renders)).filter(
        ([t]) => t >= from && t < from + HITCH_MS,
      );
      const compiling = renders.filter(([, , added]) => added > 0);
      entry.hitch = {
        worst: round(Math.max(...deltas)),
        over80: deltas.filter((d) => d > 80).length,
        // The render calls of the window: the slowest, and the ones that linked a program (their total time and the programs).
        worstRenderMs: round(Math.max(...renders.map(([, d]) => d))),
        compileMs: round(compiling.reduce((sum, [, d]) => sum + d, 0)),
        programsAdded: compiling.reduce((sum, [, , added]) => sum + added, 0),
        linked: await page.evaluate(() => window.__linked),
      };
    }
    runs[c.name].push(entry);
    await context.close();
  }
}
const renderer = runs[cases[0].name][0].first.renderer;
if (/swiftshader|software|llvmpipe/i.test(renderer))
  throw new Error(`software renderer: ${renderer}`);

const pick = (list, f) => round(median(list.map(f)));
const summary = Object.fromEntries(
  cases.map((c) => {
    const list = runs[c.name];
    const stat = (key) => ({
      medianMs: pick(list, (e) => e[key].stats.medianMs),
      p95Ms: pick(list, (e) => e[key].stats.p95Ms),
      maxMs: pick(list, (e) => e[key].stats.maxMs),
      jsMs: pick(list, (e) => e[key].jsMs.median),
      jsP95: pick(list, (e) => e[key].jsMs.p95),
      renderMs: pick(list, (e) => e[key].renderMs.median),
      draws: pick(list, (e) => e[key].drawCalls),
      triangles: pick(list, (e) => e[key].triangles),
      programs: pick(list, (e) => e[key].programs),
      gpuMB: pick(list, (e) => e[key].gpuMegabytes),
    });
    return [
      c.name,
      {
        first: stat('first'),
        ...(args.motion ? { motion: stat('motion') } : {}),
        ...(args.hitch
          ? {
              hitchWorstMs: pick(list, (e) => e.hitch.worst),
              hitchOver80: pick(list, (e) => e.hitch.over80),
              worstRenderMs: pick(list, (e) => e.hitch.worstRenderMs),
              compileMs: pick(list, (e) => e.hitch.compileMs),
              programsAdded: pick(list, (e) => e.hitch.programsAdded),
              linked: list[0].hitch.linked,
            }
          : {}),
      },
    ];
  }),
);
const report = {
  renderer,
  quality,
  viewport: { width, height, dpr },
  throttle,
  phone: Boolean(args.phone),
  rounds,
  framesPerRun: frames,
  summary,
  measuredAt: new Date().toISOString(),
};
console.log(JSON.stringify(report, null, 1));
if (typeof args.out === 'string') {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(report, null, 2));
}
await browser.close();

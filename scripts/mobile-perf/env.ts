import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

export function readLoadAverage() {
  const text = execSync('uptime', { encoding: 'utf8' });
  const m = text.match(/load averages?:\s*([\d.]+)/i) ?? text.match(/load average:\s*([\d.]+)/i);
  const load1 = m ? Number(m[1]) : NaN;
  return { uptimeLine: text.trim(), load1min: load1 };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForQuietLoad(maxWaitMin = 5) {
  const deadline = Date.now() + maxWaitMin * 60_000;
  let sample = readLoadAverage();
  while (!Number.isFinite(sample.load1min) || sample.load1min > 2) {
    if (Date.now() >= deadline) return { ...sample, timedOut: true };
    await sleep(15_000);
    sample = readLoadAverage();
  }
  return { ...sample, timedOut: false };
}

export async function collectEnvMeta(input: {
  profile: string;
  throttle: number;
  viewport: { width: number; height: number };
  dpr: number;
  network?: string;
  gitHead?: string;
}) {
  const load = readLoadAverage();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const version = browser.version();
  await browser.close();
  let head = input.gitHead;
  if (!head) {
    try {
      head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      head = 'unknown';
    }
  }
  return {
    node: process.version,
    chromium: version,
    gitHead: head,
    profile: input.profile,
    throttle: input.throttle,
    viewport: input.viewport,
    dpr: input.dpr,
    network: input.network ?? 'none',
    load1min: load.load1min,
    uptimeLine: load.uptimeLine,
    collectedAt: new Date().toISOString(),
    renderer: undefined,
  };
}

export function assertHardwareRenderer(renderer: string) {
  if (/swiftshader|software|llvmpipe/i.test(renderer)) {
    throw new Error(`software renderer refused: ${renderer}`);
  }
}

export function readTokenFile(tokenFile: string) {
  const runtime = JSON.parse(readFileSync(tokenFile, 'utf8')) as {
    directory: string;
    port?: number;
  };
  const token = readFileSync(`${runtime.directory}/owner-token`, 'utf8').trim();
  return { token, runtime };
}

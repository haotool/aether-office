import type { Browser, Page } from '@playwright/test';
import { applyNetworkProfile } from './network.ts';
import type { MeasureSettings } from './measure-types.ts';

export const HARNESS_INIT_SCRIPT = `
(() => {
  const api = { count: 0 };
  const origFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    if (String(args[0]).includes('/api')) api.count += 1;
    return origFetch(...args);
  };
  window.__aetherApiCount = api;
  const longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ duration: e.duration, startTime: e.startTime });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask unsupported */ }
  window.__aetherLongTasks = longTasks;
})();
`;

export async function openMeasurePage(
  browser: Browser,
  settings: MeasureSettings,
  quality: string,
) {
  let coldStartBytes = 0;
  const context = await browser.newContext({
    viewport: { width: settings.width, height: settings.height },
    deviceScaleFactor: settings.dpr,
    isMobile: settings.phone,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('response', (res) => {
    const len = Number(res.headers()['content-length'] ?? 0);
    if (Number.isFinite(len) && len > 0) coldStartBytes += len;
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
    },
    { q: quality, panel: settings.phone },
  );
  await page.addInitScript(HARNESS_INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  if (settings.throttle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.throttle });
  }
  await applyNetworkProfile(cdp, settings.network);
  return { context, page, coldStartBytes, started: Date.now() };
}

export async function enterOfficeAndWaitProbe(
  page: Page,
  baseUrl: string,
  frames: number,
  token: string,
) {
  await page.goto(`${baseUrl}/?perf=${frames}`);
  await page.getByLabel(/access token|存取權杖/i).fill(token);
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await page.waitForFunction(() => '__aetherPerf' in window, undefined, { timeout: 120_000 });
}

import type { Page } from '@playwright/test';
import { assertHardwareRenderer } from './env.ts';

export type HarnessLongTask = { duration: number; startTime: number };

export type HarnessPerfReport = {
  renderer: string;
  drawCalls: number;
  triangles: number;
  gpuMegabytes: number;
  jsMs: { p95: number };
  renderMs: { p95: number };
  stats: { p95Ms: number };
};

export type HarnessPageSamples = {
  probe: HarnessPerfReport | null;
  longTasks: HarnessLongTask[];
  apiCount: number;
};

type ProbeWindow = Window & {
  __aetherPerf?: HarnessPerfReport;
  __aetherLongTasks?: HarnessLongTask[];
  __aetherApiCount?: { count: number };
};

function isHarnessPerfReport(value: unknown): value is HarnessPerfReport {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const jsMs = row.jsMs;
  const renderMs = row.renderMs;
  const stats = row.stats;
  return (
    typeof row.renderer === 'string' &&
    typeof row.drawCalls === 'number' &&
    typeof row.triangles === 'number' &&
    typeof row.gpuMegabytes === 'number' &&
    !!jsMs &&
    typeof jsMs === 'object' &&
    typeof (jsMs as { p95?: number }).p95 === 'number' &&
    !!renderMs &&
    typeof renderMs === 'object' &&
    typeof (renderMs as { p95?: number }).p95 === 'number' &&
    !!stats &&
    typeof stats === 'object' &&
    typeof (stats as { p95Ms?: number }).p95Ms === 'number'
  );
}

export async function readHarnessSamples(page: Page): Promise<HarnessPageSamples> {
  const raw = await page.evaluate(() => {
    const w = window as ProbeWindow;
    return {
      probe: w.__aetherPerf ?? null,
      longTasks: w.__aetherLongTasks ?? [],
      apiCount: w.__aetherApiCount?.count ?? 0,
    };
  });
  const probe = isHarnessPerfReport(raw.probe) ? raw.probe : null;
  return { probe, longTasks: raw.longTasks, apiCount: raw.apiCount };
}

function renderMsP95(probe: HarnessPerfReport): number {
  return probe.renderMs.p95 ?? probe.stats.p95Ms;
}

export function metricsFromProbe(
  probe: HarnessPerfReport,
  longTasks: HarnessLongTask[],
  apiCount: number,
  coldStartBytes: number,
  elapsedMin: number,
) {
  const renderer = probe.renderer;
  assertHardwareRenderer(renderer);
  const elapsed = Math.max(elapsedMin, 1 / 60);
  return {
    renderer,
    metrics: {
      renderMsP95: renderMsP95(probe),
      jsMsP95: probe.jsMs.p95,
      drawCalls: probe.drawCalls,
      triangles: probe.triangles,
      gpuMB: probe.gpuMegabytes,
      apiRequests: apiCount,
      apiPerMinute: Math.round(apiCount / elapsed),
      longTaskCount: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((s, t) => s + t.duration, 0) * 100) / 100,
      coldStartBytes,
    },
  };
}

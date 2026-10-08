import { summarizeFrames, type PerfReport } from '../perf/perf.js';
import type {
  FieldPerfCaptureInput,
  FieldPerfLongTask,
  FieldPerfNavStartup,
  FieldPerfReport,
  FieldPerfUaParse,
} from './field-perf-types.js';
import type { LoafSampleCapture, LongTaskSampleCapture } from './field-perf-samples.js';

const DROPPED_FRAME_MS = 50;

export const roundFieldPerf = (n: number) => Math.round(n * 100) / 100;

function readDisplayMode(): string | null {
  if (typeof window === 'undefined') return null;
  for (const mode of ['standalone', 'fullscreen', 'minimal-ui', 'browser'] as const) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode;
  }
  return null;
}

export function readNavigationStartup(): FieldPerfNavStartup {
  const nav = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  if (!nav)
    return {
      warmStart: null,
      navigationType: null,
      domContentLoadedMs: null,
      loadEventEndMs: null,
    };
  const warmStart =
    nav.type === 'back_forward' ||
    nav.type === 'reload' ||
    (nav.transferSize === 0 && nav.decodedBodySize > 0)
      ? true
      : nav.type === 'navigate' && nav.transferSize > 0
        ? false
        : null;
  return {
    warmStart,
    navigationType: nav.type,
    domContentLoadedMs:
      nav.domContentLoadedEventEnd > 0 ? roundFieldPerf(nav.domContentLoadedEventEnd) : null,
    loadEventEndMs: nav.loadEventEnd > 0 ? roundFieldPerf(nav.loadEventEnd) : null,
  };
}

export function readPaintMetric(
  name: 'first-contentful-paint' | 'largest-contentful-paint',
): number | null {
  const entries = performance.getEntriesByName(name);
  const last = entries.at(-1);
  return last && last.startTime > 0 ? roundFieldPerf(last.startTime) : null;
}

export function sceneFromProbe(
  probe: PerfReport | null,
  compact: boolean | null,
  quality: string | null,
): FieldPerfReport['scene'] {
  if (!probe) {
    return {
      probe: null,
      compact,
      quality,
      drawCalls: null,
      triangles: null,
      devicePixelRatio: null,
    };
  }
  return {
    probe,
    compact,
    quality: quality ?? probe.quality,
    drawCalls: probe.drawCalls,
    triangles: probe.triangles,
    devicePixelRatio: probe.devicePixelRatio,
  };
}

export function buildLongTasksSection(
  longTasks: LongTaskSampleCapture | null,
): FieldPerfReport['longTasks'] {
  if (longTasks === null) return null;
  if (longTasks.totalCount > 0) {
    return {
      count: longTasks.totalCount,
      retainedCount: longTasks.entries.length,
      maxRetainedEntries: longTasks.maxRetained,
      truncated: longTasks.truncated,
      totalBlockingMs: roundFieldPerf(longTasks.totalBlockingMs),
      maxDurationMs: longTasks.maxDurationMs,
      entries: longTasks.entries,
    };
  }
  return {
    count: 0,
    retainedCount: 0,
    maxRetainedEntries: longTasks.maxRetained,
    truncated: false,
    totalBlockingMs: 0,
    maxDurationMs: null,
    entries: [],
  };
}

export function buildLoafSection(loaf: LoafSampleCapture | null): FieldPerfReport['loaf'] {
  if (loaf === null) return null;
  if (loaf.totalCount > 0) {
    return {
      count: loaf.totalCount,
      retainedCount: loaf.entries.length,
      maxRetainedEntries: loaf.maxRetained,
      truncated: loaf.truncated,
      totalDurationMs: roundFieldPerf(loaf.totalDurationMs),
      maxDurationMs: loaf.maxDurationMs,
      entries: loaf.entries,
    };
  }
  return {
    count: 0,
    retainedCount: 0,
    maxRetainedEntries: loaf.maxRetained,
    truncated: false,
    totalDurationMs: 0,
    maxDurationMs: null,
    entries: [],
  };
}

type NetworkConnection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

export function readNetworkConnection(): NetworkConnection | undefined {
  return (navigator as Navigator & { connection?: NetworkConnection }).connection;
}

export function buildDeviceBlock(ua: string, parsed: FieldPerfUaParse): FieldPerfReport['device'] {
  return {
    userAgent: ua,
    platform: typeof navigator !== 'undefined' ? navigator.platform : null,
    ...parsed,
    deviceMemoryGb:
      'deviceMemory' in navigator && typeof navigator.deviceMemory === 'number'
        ? navigator.deviceMemory
        : null,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    screen:
      typeof screen !== 'undefined'
        ? {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
          }
        : { width: 0, height: 0, availWidth: 0, availHeight: 0 },
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  };
}

export function buildContextBlock(
  input: FieldPerfCaptureInput,
  conn: NetworkConnection | undefined,
): FieldPerfReport['context'] {
  return {
    displayMode: readDisplayMode(),
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    serviceWorker: {
      supported: 'serviceWorker' in navigator,
      controller: 'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : false,
      registrations: null,
    },
    connection: {
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : null,
      rttMs: typeof conn?.rtt === 'number' ? conn.rtt : null,
      saveData: typeof conn?.saveData === 'boolean' ? conn.saveData : null,
    },
    lowPowerMode: input.lowPowerMode,
  };
}

export function buildFramesBlock(input: FieldPerfCaptureInput): FieldPerfReport['frames'] {
  const frameWindow = input.frames.deltasMs;
  const stats = summarizeFrames(frameWindow);
  const dropped =
    input.frames.totalCount > 0
      ? roundFieldPerf(input.frames.droppedTotalCount / input.frames.totalCount)
      : null;
  return {
    sampleCount: input.frames.totalCount,
    retainedSampleCount: frameWindow.length,
    maxRetainedSamples: input.frames.maxRetained,
    truncated: input.frames.truncated,
    percentilesFromRetainedWindow: true,
    visibleMs: roundFieldPerf(input.visibleMs),
    hiddenMs: roundFieldPerf(input.hiddenMs),
    p50Ms: stats?.medianMs ?? null,
    p95Ms: stats?.p95Ms ?? null,
    p99Ms: stats?.p99Ms ?? null,
    droppedRatio: dropped,
    droppedFrameCount: input.frames.droppedTotalCount,
    maxDeltaMs: input.frames.maxDeltaMs,
    thresholdMs: DROPPED_FRAME_MS,
  };
}

export function buildNetworkBlock(
  apiRequests: number,
  durationMs: number,
): FieldPerfReport['network'] {
  const minutes = durationMs / 60_000;
  return {
    apiRequests,
    perMinute: minutes > 0 ? roundFieldPerf(apiRequests / minutes) : null,
    method:
      'Count of fetch() calls whose URL pathname starts with /api during the collection window (same-origin).',
  };
}

/** Total Blocking Time: sum of (duration − 50 ms) for long tasks over the threshold. */
export function longTaskTotalBlockingMs(tasks: FieldPerfLongTask[]): number {
  const threshold = 50;
  return tasks.reduce((s, t) => s + Math.max(0, t.durationMs - threshold), 0);
}

import type { PerfReport } from './perf.js';
import type {
  FrameSampleCapture,
  LoafSampleCapture,
  LongTaskSampleCapture,
} from './field-perf-samples.js';

export type FieldPerfLongTask = { durationMs: number; startTimeMs: number; name: string | null };

export type FieldPerfLoaf = {
  durationMs: number;
  startTimeMs: number;
  blockingDurationMs: number | null;
};

type FieldPerfBuild = { version: string | null };

type FieldPerfDevice = {
  userAgent: string;
  platform: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  screen: { width: number; height: number; availWidth: number; availHeight: number };
  devicePixelRatio: number;
};

type FieldPerfContext = {
  displayMode: string | null;
  isSecureContext: boolean;
  serviceWorker: {
    supported: boolean;
    controller: boolean;
    registrations: number | null;
  };
  connection: {
    effectiveType: string | null;
    downlinkMbps: number | null;
    rttMs: number | null;
    saveData: boolean | null;
  };
  lowPowerMode: boolean | null;
};

type FieldPerfStartup = {
  warmStart: boolean | null;
  navigationType: string | null;
  domContentLoadedMs: number | null;
  loadEventEndMs: number | null;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
};

type FieldPerfFrames = {
  sampleCount: number;
  retainedSampleCount: number;
  maxRetainedSamples: number;
  truncated: boolean;
  percentilesFromRetainedWindow: boolean;
  visibleMs: number;
  hiddenMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  droppedRatio: number | null;
  droppedFrameCount: number;
  maxDeltaMs: number | null;
  thresholdMs: number;
};

type FieldPerfLongTasksSection = {
  count: number;
  retainedCount: number;
  maxRetainedEntries: number;
  truncated: boolean;
  totalBlockingMs: number;
  maxDurationMs: number | null;
  entries: FieldPerfLongTask[];
} | null;

type FieldPerfLoafSection = {
  count: number;
  retainedCount: number;
  maxRetainedEntries: number;
  truncated: boolean;
  totalDurationMs: number;
  maxDurationMs: number | null;
  entries: FieldPerfLoaf[];
} | null;

type FieldPerfMemory = {
  jsHeapUsedMb: number | null;
  jsHeapTotalMb: number | null;
  jsHeapLimitMb: number | null;
} | null;

type FieldPerfScene = {
  probe: PerfReport | null;
  compact: boolean | null;
  quality: string | null;
  drawCalls: number | null;
  triangles: number | null;
  devicePixelRatio: number | null;
};

type FieldPerfNetwork = {
  apiRequests: number;
  perMinute: number | null;
  method: string;
};

type FieldPerfEvents = {
  webglContextLost: number;
  webglContextRestored: number;
  visibilityChanges: number;
};

export type FieldPerfReport = {
  schema: string;
  capturedAt: string;
  durationMs: number;
  unsupported: string[];
  build: FieldPerfBuild;
  device: FieldPerfDevice;
  context: FieldPerfContext;
  startup: FieldPerfStartup;
  frames: FieldPerfFrames;
  longTasks: FieldPerfLongTasksSection;
  loaf: FieldPerfLoafSection;
  memory: FieldPerfMemory;
  scene: FieldPerfScene;
  network: FieldPerfNetwork;
  events: FieldPerfEvents;
};

export type FieldPerfCaptureInput = {
  startedAtMs: number;
  endedAtMs: number;
  visibleMs: number;
  hiddenMs: number;
  frames: FrameSampleCapture;
  longTasks: LongTaskSampleCapture | null;
  loaf: LoafSampleCapture | null;
  memory: FieldPerfMemory;
  apiRequests: number;
  events: FieldPerfEvents;
  probe: PerfReport | null;
  compact: boolean | null;
  quality: string | null;
  build: FieldPerfBuild;
  lowPowerMode: boolean | null;
  unsupported: string[];
};

export type FieldPerfUaParse = Pick<
  FieldPerfDevice,
  'browser' | 'browserVersion' | 'os' | 'osVersion'
>;

export type FieldPerfNavStartup = Pick<
  FieldPerfStartup,
  'warmStart' | 'navigationType' | 'domContentLoadedMs' | 'loadEventEndMs'
>;

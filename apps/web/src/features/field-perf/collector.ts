import type { PerfReport } from '@aether/office-scene';
import {
  buildFieldPerfReport,
  type FieldPerfCaptureInput,
  type FieldPerfLoaf,
  type FieldPerfLongTask,
  type FieldPerfReport,
} from '../../../../../packages/office-scene/src/field/field-perf-report.js';
import { mayAppendFieldPerfFrameDelta } from './frame-delta.js';
import {
  FrameDeltaBuffer,
  LoafSampleBuffer,
  LongTaskSampleBuffer,
} from '../../../../../packages/office-scene/src/field/field-perf-samples.js';

const DROPPED_FRAME_MS = 50;

type FieldPerfHook = {
  onProbe: (report: PerfReport) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
};

type PerfMemoryWindow = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
};

const API_PREFIX = '/api';

export class FieldPerfCollector {
  readonly startedAtMs = performance.now();
  private frameSamples = new FrameDeltaBuffer();
  private visibleMs = 0;
  private hiddenMs = 0;
  private lastFrameAt: number | null = null;
  private lastVisibilityAt = performance.now();
  private rafId = 0;
  private running = false;
  private longTasks = new LongTaskSampleBuffer();
  private longTaskObserver: PerformanceObserver | null = null;
  private loaf = new LoafSampleBuffer();
  private loafObserver: PerformanceObserver | null = null;
  private unsupported: string[] = [];
  private apiRequests = 0;
  private fetchPatched = false;
  private nativeFetch: typeof fetch | null = null;
  private events = { webglContextLost: 0, webglContextRestored: 0, visibilityChanges: 0 };
  private latestProbe: PerfReport | null = null;
  private compact: boolean | null = null;
  private quality: string | null = null;
  private buildVersion: string | null = null;

  start() {
    if (this.running) return;
    this.running = true;
    this.unsupported.push('lowPowerMode (no standard web API on Safari or Chrome)');
    this.onVisibility = this.onVisibility.bind(this);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.patchFetch();
    this.attachLongTaskObserver();
    this.attachLoafObserver();
    this.onVisibility();
    this.loop();
    void this.loadBuildVersion();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.unpatchFetch();
    this.longTaskObserver?.disconnect();
    this.loafObserver?.disconnect();
    this.flushVisibilityClock();
  }

  setSceneMeta(compact: boolean, quality?: string) {
    this.compact = compact;
    if (quality) this.quality = quality;
  }

  hooks(): FieldPerfHook {
    return {
      onProbe: (report) => {
        this.latestProbe = report;
        this.quality ??= report.quality;
      },
      onContextLost: () => {
        this.events.webglContextLost += 1;
      },
      onContextRestored: () => {
        this.events.webglContextRestored += 1;
      },
    };
  }

  elapsedMs() {
    return performance.now() - this.startedAtMs;
  }

  async snapshot(): Promise<FieldPerfReport> {
    this.flushVisibilityClock();
    const endedAtMs = performance.now();
    const swRegs =
      'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistrations().then((r) => r.length)
        : null;
    const input: FieldPerfCaptureInput = {
      startedAtMs: this.startedAtMs,
      endedAtMs,
      visibleMs: this.visibleMs,
      hiddenMs: this.hiddenMs,
      frames: this.frameSamples.capture(),
      longTasks: this.longTaskObserver ? this.longTasks.capture() : null,
      loaf: this.loafObserver ? this.loaf.capture() : null,
      memory: this.readMemory(),
      apiRequests: this.apiRequests,
      events: { ...this.events },
      probe: this.latestProbe,
      compact: this.compact,
      quality: this.quality,
      build: { version: this.buildVersion },
      lowPowerMode: null,
      unsupported: [...this.unsupported],
    };
    const report = buildFieldPerfReport(input);
    if (swRegs !== null) report.context.serviceWorker.registrations = swRegs;
    return report;
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const frame = mayAppendFieldPerfFrameDelta(document.visibilityState, this.lastFrameAt, now);
    if (frame.append) this.frameSamples.push(frame.delta, DROPPED_FRAME_MS);
    this.lastFrameAt = now;
    this.rafId = requestAnimationFrame(this.loop);
  };

  private onVisibility() {
    this.flushVisibilityClock();
    this.events.visibilityChanges += 1;
    this.lastVisibilityAt = performance.now();
    if (document.visibilityState !== 'visible') this.lastFrameAt = null;
  }

  private flushVisibilityClock() {
    const now = performance.now();
    const slice = now - this.lastVisibilityAt;
    if (document.visibilityState === 'visible') this.visibleMs += slice;
    else this.hiddenMs += slice;
    this.lastVisibilityAt = now;
  }

  private patchFetch() {
    if (this.fetchPatched) return;
    this.nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const path = new URL(url, window.location.origin).pathname;
        if (path.startsWith(API_PREFIX)) this.apiRequests += 1;
      } catch {
        /* ignore malformed URLs */
      }
      const fetchImpl = this.nativeFetch;
      if (!fetchImpl) throw new Error('native fetch not saved');
      return fetchImpl(input, init);
    }) as typeof fetch;
    this.fetchPatched = true;
  }

  private unpatchFetch() {
    if (this.nativeFetch) globalThis.fetch = this.nativeFetch;
    this.fetchPatched = false;
  }

  private attachLongTaskObserver() {
    if (typeof PerformanceObserver === 'undefined') {
      this.unsupported.push('PerformanceObserver (longtask)');
      return;
    }
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            durationMs: entry.duration,
            startTimeMs: entry.startTime,
            name: entry.name ?? null,
          } satisfies FieldPerfLongTask);
        }
      });
      this.longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      this.unsupported.push('longtask PerformanceObserver');
      this.longTaskObserver = null;
    }
  }

  private attachLoafObserver() {
    if (typeof PerformanceObserver === 'undefined') {
      this.unsupported.push('PerformanceObserver (long-animation-frame)');
      return;
    }
    try {
      this.loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const loaf = entry as PerformanceEntry & { blockingDuration?: number };
          this.loaf.push({
            durationMs: entry.duration,
            startTimeMs: entry.startTime,
            blockingDurationMs:
              typeof loaf.blockingDuration === 'number' ? loaf.blockingDuration : null,
          } satisfies FieldPerfLoaf);
        }
      });
      this.loafObserver.observe({ type: 'long-animation-frame', buffered: true });
    } catch {
      this.unsupported.push('long-animation-frame PerformanceObserver');
      this.loafObserver = null;
    }
  }

  private readMemory(): FieldPerfCaptureInput['memory'] {
    const mem = (performance as PerfMemoryWindow).memory;
    if (!mem) {
      this.unsupported.push('performance.memory');
      return null;
    }
    const mb = (n: number) => Math.round((n / (1024 * 1024)) * 100) / 100;
    return {
      jsHeapUsedMb: mb(mem.usedJSHeapSize),
      jsHeapTotalMb: mb(mem.totalJSHeapSize),
      jsHeapLimitMb: mb(mem.jsHeapSizeLimit),
    };
  }

  private async loadBuildVersion() {
    try {
      const res = await fetch('/health');
      if (!res.ok) return;
      const body = (await res.json()) as { version?: string };
      if (body.version) this.buildVersion = body.version;
    } catch {
      /* offline or blocked */
    }
  }
}

export function attachFieldPerfHooks(hook: FieldPerfHook) {
  (window as Window & { __aetherFieldPerfHook?: FieldPerfHook }).__aetherFieldPerfHook = hook;
}

import { describe, expect, it } from 'vitest';
import {
  FIELD_PERF_SCHEMA,
  buildFieldPerfReport,
  longTaskTotalBlockingMs,
  parseUserAgent,
  type FieldPerfCaptureInput,
} from '../../packages/office-scene/src/field-perf-report.js';

const frameCapture = (
  deltas: number[],
  extra: Partial<FieldPerfCaptureInput['frames']> = {},
): FieldPerfCaptureInput['frames'] => ({
  deltasMs: deltas,
  totalCount: deltas.length,
  droppedTotalCount: deltas.filter((d) => d > 50).length,
  maxDeltaMs: deltas.length ? Math.max(...deltas) : null,
  truncated: false,
  maxRetained: 36_000,
  ...extra,
});

const baseInput = (): FieldPerfCaptureInput => ({
  startedAtMs: 1000,
  endedAtMs: 121_000,
  visibleMs: 110_000,
  hiddenMs: 10_000,
  frames: frameCapture([16, 17, 16, 55, 16]),
  longTasks: null,
  loaf: null,
  memory: null,
  apiRequests: 4,
  events: { webglContextLost: 0, webglContextRestored: 0, visibilityChanges: 2 },
  probe: null,
  compact: true,
  quality: 'balanced',
  build: { version: '0.4.0-dev.0' },
  lowPowerMode: null,
  unsupported: ['performance.memory', 'longtask PerformanceObserver'],
});

describe('parseUserAgent', () => {
  it('reads iOS Safari and Chrome tokens without guessing unknown browsers', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toMatchObject({ os: 'iOS', browser: 'Safari', browserVersion: '18.0' });
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1',
      ),
    ).toMatchObject({ os: 'iOS', browser: 'Chrome' });
  });
});

describe('buildFieldPerfReport', () => {
  it('fills required sections, lists unsupported APIs, and computes frame stats', () => {
    const report = buildFieldPerfReport(baseInput());
    expect(report.schema).toBe(FIELD_PERF_SCHEMA);
    expect(report.durationMs).toBe(120_000);
    expect(report.frames.sampleCount).toBe(5);
    expect(report.frames.retainedSampleCount).toBe(5);
    expect(report.frames.truncated).toBe(false);
    expect(report.frames.p50Ms).toBe(16);
    expect(report.frames.p95Ms).toBe(55);
    expect(report.frames.droppedRatio).toBe(0.2);
    expect(report.longTasks).toBeNull();
    expect(report.loaf).toBeNull();
    expect(report.memory).toBeNull();
    expect(report.scene.compact).toBe(true);
    expect(report.network.apiRequests).toBe(4);
    expect(report.network.perMinute).toBe(2);
    expect(report.unsupported).toEqual(
      expect.arrayContaining(['performance.memory', 'longtask PerformanceObserver']),
    );
    expect(report.build).toEqual({ version: '0.4.0-dev.0' });
    expect('commit' in report.build).toBe(false);
  });

  it('sums long-task blocking time above 50 ms (TBT), not full durations', () => {
    const tasks = [
      { durationMs: 60, startTimeMs: 0, name: null },
      { durationMs: 120, startTimeMs: 100, name: null },
      { durationMs: 40, startTimeMs: 200, name: null },
    ];
    expect(longTaskTotalBlockingMs(tasks)).toBe(80);
    const report = buildFieldPerfReport({
      ...baseInput(),
      longTasks: {
        entries: tasks,
        totalCount: tasks.length,
        totalDurationMs: 220,
        totalBlockingMs: 80,
        maxDurationMs: 120,
        truncated: false,
        maxRetained: 600,
      },
    });
    expect(report.longTasks?.totalBlockingMs).toBe(80);
  });

  it('keeps missing paint metrics null instead of inventing them', () => {
    const report = buildFieldPerfReport(baseInput());
    expect(report.startup.firstContentfulPaintMs).toBeNull();
    expect(report.startup.largestContentfulPaintMs).toBeNull();
  });
});

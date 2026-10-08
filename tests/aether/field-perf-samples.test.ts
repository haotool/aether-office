import { describe, expect, it } from 'vitest';
import {
  BoundedRetainBuffer,
  FrameDeltaBuffer,
  LongTaskSampleBuffer,
} from '../../packages/office-scene/src/field-perf-samples.js';
import {
  buildFieldPerfReport,
  type FieldPerfCaptureInput,
} from '../../packages/office-scene/src/field-perf-report.js';

describe('BoundedRetainBuffer', () => {
  it('caps retained entries and keeps an accurate totalCount', () => {
    const buf = new BoundedRetainBuffer<number>(3);
    for (let i = 1; i <= 5; i += 1) buf.push(i);
    expect(buf.totalCount).toBe(5);
    expect(buf.truncated).toBe(true);
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });
});

describe('FrameDeltaBuffer', () => {
  it('tracks dropped totals across truncation and limits retained deltas', () => {
    const buf = new FrameDeltaBuffer(4);
    for (const delta of [16, 16, 55, 16, 16, 80]) buf.push(delta, 50);
    const cap = buf.capture();
    expect(cap.totalCount).toBe(6);
    expect(cap.droppedTotalCount).toBe(2);
    expect(cap.maxDeltaMs).toBe(80);
    expect(cap.truncated).toBe(true);
    expect(cap.deltasMs.length).toBeLessThanOrEqual(4);
    expect(cap.deltasMs.at(-1)).toBe(80);
  });
});

describe('buildFieldPerfReport truncation', () => {
  const base = (): Omit<FieldPerfCaptureInput, 'frames' | 'longTasks' | 'loaf'> => ({
    startedAtMs: 0,
    endedAtMs: 60_000,
    visibleMs: 60_000,
    hiddenMs: 0,
    memory: null,
    apiRequests: 0,
    events: { webglContextLost: 0, webglContextRestored: 0, visibilityChanges: 0 },
    probe: null,
    compact: null,
    quality: null,
    build: { version: null },
    lowPowerMode: null,
    unsupported: [],
  });

  it('uses session totals for counts and the retained window for percentiles', () => {
    const buf = new FrameDeltaBuffer(3);
    for (const delta of [16, 16, 16, 200, 16]) buf.push(delta, 50);
    const report = buildFieldPerfReport({
      ...base(),
      frames: buf.capture(),
      longTasks: null,
      loaf: null,
    });
    expect(report.frames.sampleCount).toBe(5);
    expect(report.frames.retainedSampleCount).toBe(3);
    expect(report.frames.truncated).toBe(true);
    expect(report.frames.droppedFrameCount).toBe(1);
    expect(report.frames.droppedRatio).toBe(0.2);
    expect(report.frames.p95Ms).toBe(200);
  });

  it('aggregates long tasks beyond the retained entry cap', () => {
    const tasks = new LongTaskSampleBuffer(2);
    for (const durationMs of [60, 70, 80]) {
      tasks.push({ durationMs, startTimeMs: 0, name: null });
    }
    const report = buildFieldPerfReport({
      ...base(),
      frames: {
        deltasMs: [],
        totalCount: 0,
        droppedTotalCount: 0,
        maxDeltaMs: null,
        truncated: false,
        maxRetained: 3,
      },
      longTasks: tasks.capture(),
      loaf: null,
    });
    expect(report.longTasks?.count).toBe(3);
    expect(report.longTasks?.retainedCount).toBe(2);
    expect(report.longTasks?.truncated).toBe(true);
    expect(report.longTasks?.totalBlockingMs).toBe(10 + 20 + 30);
    expect(report.longTasks?.maxDurationMs).toBe(80);
  });
});

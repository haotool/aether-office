import type { FieldPerfLoaf, FieldPerfLongTask } from './field-perf-types.js';

const FIELD_PERF_MAX_FRAME_SAMPLES = 10 * 60 * 60;

const FIELD_PERF_MAX_LONG_TASK_SAMPLES = 600;
const FIELD_PERF_MAX_LOAF_SAMPLES = 3_600;

const LONG_TASK_BLOCKING_THRESHOLD_MS = 50;

export class BoundedRetainBuffer<T> {
  readonly maxRetained: number;
  private slots: T[] = [];
  private writeIndex = 0;
  private filled = 0;
  totalCount = 0;
  truncated = false;

  constructor(maxRetained: number) {
    this.maxRetained = maxRetained;
  }

  push(item: T) {
    this.totalCount += 1;
    if (this.filled < this.maxRetained) {
      this.slots[this.filled] = item;
      this.filled += 1;
      return;
    }
    this.truncated = true;
    this.slots[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.maxRetained;
  }

  toArray(): T[] {
    if (!this.truncated) return this.slots.slice(0, this.filled);
    const out: T[] = [];
    for (let i = 0; i < this.maxRetained; i += 1) {
      const slot = this.slots[(this.writeIndex + i) % this.maxRetained];
      if (slot !== undefined) out.push(slot);
    }
    return out;
  }
}

export type FrameSampleCapture = {
  deltasMs: number[];
  totalCount: number;
  droppedTotalCount: number;
  maxDeltaMs: number | null;
  truncated: boolean;
  maxRetained: number;
};

export class FrameDeltaBuffer {
  private readonly ring: BoundedRetainBuffer<number>;
  droppedTotalCount = 0;
  maxDeltaMs: number | null = null;

  constructor(maxRetained = FIELD_PERF_MAX_FRAME_SAMPLES) {
    this.ring = new BoundedRetainBuffer(maxRetained);
  }

  push(deltaMs: number, droppedThresholdMs: number) {
    if (this.maxDeltaMs === null || deltaMs > this.maxDeltaMs) this.maxDeltaMs = deltaMs;
    if (deltaMs > droppedThresholdMs) this.droppedTotalCount += 1;
    this.ring.push(deltaMs);
  }

  capture(): FrameSampleCapture {
    return {
      deltasMs: this.ring.toArray(),
      totalCount: this.ring.totalCount,
      droppedTotalCount: this.droppedTotalCount,
      maxDeltaMs: this.maxDeltaMs,
      truncated: this.ring.truncated,
      maxRetained: this.ring.maxRetained,
    };
  }
}

export type LongTaskSampleCapture = {
  entries: FieldPerfLongTask[];
  totalCount: number;
  totalDurationMs: number;
  totalBlockingMs: number;
  maxDurationMs: number | null;
  truncated: boolean;
  maxRetained: number;
};

export class LongTaskSampleBuffer {
  private readonly ring: BoundedRetainBuffer<FieldPerfLongTask>;
  totalDurationMs = 0;
  totalBlockingMs = 0;
  maxDurationMs: number | null = null;

  constructor(maxRetained = FIELD_PERF_MAX_LONG_TASK_SAMPLES) {
    this.ring = new BoundedRetainBuffer(maxRetained);
  }

  push(entry: FieldPerfLongTask) {
    this.totalDurationMs += entry.durationMs;
    this.totalBlockingMs += Math.max(0, entry.durationMs - LONG_TASK_BLOCKING_THRESHOLD_MS);
    if (this.maxDurationMs === null || entry.durationMs > this.maxDurationMs) {
      this.maxDurationMs = entry.durationMs;
    }
    this.ring.push(entry);
  }

  capture(): LongTaskSampleCapture {
    return {
      entries: this.ring.toArray(),
      totalCount: this.ring.totalCount,
      totalDurationMs: this.totalDurationMs,
      totalBlockingMs: this.totalBlockingMs,
      maxDurationMs: this.maxDurationMs,
      truncated: this.ring.truncated,
      maxRetained: this.ring.maxRetained,
    };
  }
}

export type LoafSampleCapture = {
  entries: FieldPerfLoaf[];
  totalCount: number;
  totalDurationMs: number;
  maxDurationMs: number | null;
  truncated: boolean;
  maxRetained: number;
};

export class LoafSampleBuffer {
  private readonly ring: BoundedRetainBuffer<FieldPerfLoaf>;
  totalDurationMs = 0;
  maxDurationMs: number | null = null;

  constructor(maxRetained = FIELD_PERF_MAX_LOAF_SAMPLES) {
    this.ring = new BoundedRetainBuffer(maxRetained);
  }

  push(entry: FieldPerfLoaf) {
    this.totalDurationMs += entry.durationMs;
    if (this.maxDurationMs === null || entry.durationMs > this.maxDurationMs) {
      this.maxDurationMs = entry.durationMs;
    }
    this.ring.push(entry);
  }

  capture(): LoafSampleCapture {
    return {
      entries: this.ring.toArray(),
      totalCount: this.ring.totalCount,
      totalDurationMs: this.totalDurationMs,
      maxDurationMs: this.maxDurationMs,
      truncated: this.ring.truncated,
      maxRetained: this.ring.maxRetained,
    };
  }
}

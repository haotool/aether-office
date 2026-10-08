import { parseUserAgent } from './field-perf-user-agent.js';
import type { FieldPerfCaptureInput, FieldPerfReport } from './field-perf-types.js';
import {
  buildContextBlock,
  buildDeviceBlock,
  buildFramesBlock,
  buildLoafSection,
  buildLongTasksSection,
  buildNetworkBlock,
  readNavigationStartup,
  readNetworkConnection,
  readPaintMetric,
  roundFieldPerf,
  sceneFromProbe,
} from './field-perf-report-parts.js';

export { longTaskTotalBlockingMs } from './field-perf-report-parts.js';
export { parseUserAgent } from './field-perf-user-agent.js';
export type {
  FieldPerfCaptureInput,
  FieldPerfLoaf,
  FieldPerfLongTask,
  FieldPerfReport,
} from './field-perf-types.js';

/** JSON schema id for maintainer field captures (`?fieldperf=1`). Bump when the shape changes. */
export const FIELD_PERF_SCHEMA = 'aether-field-perf/1';

/** Builds the maintainer JSON report from measured inputs only. */
export function buildFieldPerfReport(input: FieldPerfCaptureInput): FieldPerfReport {
  const durationMs = Math.max(0, input.endedAtMs - input.startedAtMs);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const parsed = parseUserAgent(ua);
  const nav = readNavigationStartup();
  const conn = readNetworkConnection();

  return {
    schema: FIELD_PERF_SCHEMA,
    capturedAt: new Date(input.endedAtMs).toISOString(),
    durationMs: roundFieldPerf(durationMs),
    unsupported: [...input.unsupported],
    build: input.build,
    device: buildDeviceBlock(ua, parsed),
    context: buildContextBlock(input, conn),
    startup: {
      ...nav,
      firstContentfulPaintMs: readPaintMetric('first-contentful-paint'),
      largestContentfulPaintMs: readPaintMetric('largest-contentful-paint'),
    },
    frames: buildFramesBlock(input),
    longTasks: buildLongTasksSection(input.longTasks),
    loaf: buildLoafSection(input.loaf),
    memory: input.memory,
    scene: sceneFromProbe(input.probe, input.compact, input.quality),
    network: buildNetworkBlock(input.apiRequests, durationMs),
    events: input.events,
  };
}

export const SCHEMA = 'aether-audit-perf-run/1';

export type MetricSummary = { median: number; p95OfP95: number };
export type RoundRow = {
  index?: number;
  caseId: string;
  metrics: Record<string, number>;
  valid?: boolean;
  invalidReason?: string;
};

export type PassThresholds = {
  renderMsP95DeltaMin: number;
  renderMsP95DeltaMinWithDraws: number;
  drawCallsDeltaMin: number;
  jsMsP95MaxRegression: number;
  b9DesktopRenderMsP95Max: number;
  relativeMinDelta: number;
  requireRelative: boolean;
};

export function median(values: number[]) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.at(Math.floor(sorted.length / 2)) ?? NaN;
}

export function percentile(values: number[], p: number) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted.at(Math.max(0, idx)) ?? NaN;
}

export function p95(values: number[]) {
  return percentile(values, 95);
}

export function p95OfP95(values: number[]) {
  return p95(values);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function isLoadValid(load1min: number) {
  return Number.isFinite(load1min) && load1min <= 2;
}

/** Load gate: successful measure after a quiet wait must not keep an invalidReason. */
export function resolveLoadValidity(
  initialLoad1min: number,
  waited: { load1min: number; timedOut: boolean },
) {
  if (isLoadValid(initialLoad1min)) return { valid: true as const };
  if (isLoadValid(waited.load1min) && !waited.timedOut) return { valid: true as const };
  if (waited.timedOut)
    return { valid: false as const, invalidReason: 'invalid:load-timeout' as const };
  return { valid: false as const, invalidReason: 'invalid:load' as const };
}

export function selectRounds(
  rounds: RoundRow[],
  opts: { discardFirst?: boolean; countInvalidLoad?: boolean; discardRoundIndex?: number } = {},
) {
  const { discardFirst = true, countInvalidLoad = false, discardRoundIndex = 0 } = opts;
  let list = [...rounds];
  if (discardFirst) list = list.filter((r) => r.index !== discardRoundIndex);
  if (!countInvalidLoad) list = list.filter((r) => r.valid !== false);
  return list;
}

export function aggregateByCase(
  rounds: RoundRow[],
  opts: { discardFirst?: boolean; countInvalidLoad?: boolean } = {},
) {
  const usable = selectRounds(rounds, opts);
  const byCase = new Map<string, Record<string, number>[]>();
  for (const row of usable) {
    const bucket = byCase.get(row.caseId) ?? [];
    bucket.push(row.metrics);
    byCase.set(row.caseId, bucket);
  }
  const out: Record<string, Record<string, MetricSummary>> = {};
  for (const [caseId, metricRows] of byCase) out[caseId] = summarizeMetricRows(metricRows);
  return out;
}

function summarizeMetricRows(rows: Record<string, number>[]) {
  const first = rows[0];
  const keys = first ? Object.keys(first) : [];
  const summary: Record<string, MetricSummary> = {};
  for (const key of keys) {
    const vals = rows.map((r) => r[key]).filter((v): v is number => Number.isFinite(v));
    summary[key] = { median: round2(median(vals)), p95OfP95: round2(p95OfP95(vals)) };
  }
  return summary;
}

export function deltaBvsA(
  summaryA: Record<string, MetricSummary>,
  summaryB: Record<string, MetricSummary>,
) {
  const keys = new Set([...Object.keys(summaryA), ...Object.keys(summaryB)]);
  const delta: Record<
    string,
    {
      median: number;
      p95OfP95: number;
      regressionMedian: number;
      regressionP95: number;
      baselineP95: number;
    }
  > = {};
  for (const key of keys) {
    const a = summaryA[key];
    const b = summaryB[key];
    if (!a || !b) continue;
    delta[key] = {
      median: round2(a.median - b.median),
      p95OfP95: round2(a.p95OfP95 - b.p95OfP95),
      regressionMedian: round2(b.median - a.median),
      regressionP95: round2(b.p95OfP95 - a.p95OfP95),
      baselineP95: round2(a.p95OfP95),
    };
  }
  return delta;
}

export function noiseFloor(delta: Record<string, { median?: number; regressionMedian?: number }>) {
  const render = delta.renderMsP95?.median;
  const js = delta.jsMsP95?.regressionMedian;
  const draws = delta.drawCalls?.median;
  return {
    renderMsP95MedianImprove: Number.isFinite(render) ? render : null,
    jsMsP95MedianRegression: Number.isFinite(js) ? js : null,
    drawCallsMedianImprove: Number.isFinite(draws) ? draws : null,
    note: 'A/A interleaved deltas; use to calibrate thresholds, not as pass/fail alone.',
  };
}

export function evaluateRelativePass(
  delta: Record<string, { median: number; regressionP95: number; baselineP95?: number }>,
  metricKey: string,
  minDelta: number,
  maxP95RegressionRatio = 0.05,
) {
  const d = delta[metricKey];
  if (!d) return { pass: false, reason: `missing metric ${metricKey}` };
  if (d.median < minDelta) {
    return { pass: false, reason: `${metricKey} median improve ${d.median} < ${minDelta}` };
  }
  const cap = (d.baselineP95 ?? 0) * maxP95RegressionRatio;
  if (d.regressionP95 > cap) {
    return {
      pass: false,
      reason: `${metricKey} p95 regression ${d.regressionP95} > ${round2(cap)} (5% of baseline)`,
    };
  }
  return { pass: true, reason: `${metricKey} relative pass` };
}

export function evaluateCutPass(
  delta: Record<string, { median?: number; regressionMedian?: number }>,
  thresholds: PassThresholds,
) {
  const render = delta.renderMsP95?.median ?? 0;
  const draws = delta.drawCalls?.median ?? 0;
  const jsRegress = delta.jsMsP95?.regressionMedian ?? 0;
  const renderOk =
    render >= thresholds.renderMsP95DeltaMin ||
    (render >= thresholds.renderMsP95DeltaMinWithDraws && draws >= thresholds.drawCallsDeltaMin);
  if (!renderOk) {
    return {
      pass: false,
      reason: `CUT: renderMsP95 delta ${render} below ${thresholds.renderMsP95DeltaMin} (or draw+render combo)`,
    };
  }
  if (jsRegress > thresholds.jsMsP95MaxRegression) {
    return {
      pass: false,
      reason: `CUT: jsMsP95 regression ${jsRegress} > ${thresholds.jsMsP95MaxRegression} ms`,
    };
  }
  return { pass: true, reason: 'CUT thresholds met' };
}

export function evaluateB9Desktop(
  desktopA: { renderMsP95?: { p95OfP95: number } },
  desktopB: { renderMsP95?: { p95OfP95: number } },
  maxRatio = 0.05,
) {
  const a = desktopA.renderMsP95?.p95OfP95 ?? NaN;
  const b = desktopB.renderMsP95?.p95OfP95 ?? NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { pass: false, reason: 'B9: missing desktop renderMsP95 p95-of-p95' };
  }
  const limit = a * (1 + maxRatio);
  if (b > limit) {
    return {
      pass: false,
      reason: `B9: desktop renderMs p95 ${b} > ${round2(limit)} (+${maxRatio * 100}%)`,
    };
  }
  return { pass: true, reason: 'B9 desktop non-inferior' };
}

export function evaluatePass(
  summary: {
    delta?: {
      BvsA?: Record<
        string,
        { median?: number; regressionMedian?: number; regressionP95?: number; baselineP95?: number }
      >;
    };
    b9Desktop?: {
      A: { renderMsP95?: { p95OfP95: number } };
      B: { renderMsP95?: { p95OfP95: number } };
    };
  },
  thresholds: PassThresholds,
) {
  const delta = summary.delta?.BvsA ?? {};
  const reasons: string[] = [];
  const cut = evaluateCutPass(delta, thresholds);
  if (!cut.pass) reasons.push(cut.reason);
  const rel = evaluateRelativePass(
    delta as Record<string, { median: number; regressionP95: number; baselineP95?: number }>,
    'renderMsP95',
    thresholds.relativeMinDelta ?? 0,
  );
  if (!rel.pass && thresholds.requireRelative) reasons.push(rel.reason);
  if (summary.b9Desktop) {
    const b9 = evaluateB9Desktop(
      summary.b9Desktop.A,
      summary.b9Desktop.B,
      thresholds.b9DesktopRenderMsP95Max,
    );
    if (!b9.pass) reasons.push(b9.reason);
  }
  return {
    pass: reasons.length === 0,
    reasons: reasons.length ? reasons : ['pass rules satisfied'],
  };
}

export const DEFAULT_THRESHOLDS: PassThresholds = {
  renderMsP95DeltaMin: 2.0,
  renderMsP95DeltaMinWithDraws: 1.0,
  drawCallsDeltaMin: 8,
  jsMsP95MaxRegression: 0.3,
  b9DesktopRenderMsP95Max: 0.05,
  relativeMinDelta: 0,
  requireRelative: false,
};

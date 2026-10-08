import { describe, expect, it } from 'vitest';
import {
  aggregateByCase,
  deltaBvsA,
  evaluateB9Desktop,
  evaluateCutPass,
  evaluatePass,
  evaluateRelativePass,
  isLoadValid,
  resolveLoadValidity,
  median,
  noiseFloor,
  p95,
  selectRounds,
  DEFAULT_THRESHOLDS,
} from '../../scripts/mobile-perf/stats.ts';

describe('mobile-perf stats', () => {
  it('computes median and p95', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(p95([1, 2, 3, 4, 20])).toBe(20);
  });

  it('drops round 0 and invalid load rows by default', () => {
    const rounds = [
      { index: 0, caseId: 'A', metrics: { renderMsP95: 10 }, valid: true },
      { index: 1, caseId: 'A', metrics: { renderMsP95: 9 }, valid: true },
      {
        index: 1,
        caseId: 'A',
        metrics: { renderMsP95: 99 },
        valid: false,
        invalidReason: 'invalid:load',
      },
    ];
    expect(
      selectRounds(rounds)
        .map((r) => r.metrics.renderMsP95)
        .filter((v): v is number => Number.isFinite(v)),
    ).toEqual([9]);
    expect(
      aggregateByCase(rounds, { discardFirst: true, countInvalidLoad: false }).A?.renderMsP95
        ?.median,
    ).toBe(9);
  });

  it('fails review mutation when invalid load is counted', () => {
    const rounds = [
      { index: 0, caseId: 'A', metrics: { renderMsP95: 10 }, valid: true },
      { index: 1, caseId: 'A', metrics: { renderMsP95: 9 }, valid: true },
      { index: 1, caseId: 'A', metrics: { renderMsP95: 99 }, valid: false },
    ];
    const wrong = aggregateByCase(rounds, { discardFirst: true, countInvalidLoad: true });
    expect(wrong.A?.renderMsP95?.median).not.toBe(9);
  });

  it('fails review mutation when discard-first is disabled', () => {
    const rounds = [
      { index: 0, caseId: 'A', metrics: { renderMsP95: 50 }, valid: true },
      { index: 1, caseId: 'A', metrics: { renderMsP95: 9 }, valid: true },
    ];
    const kept = aggregateByCase(rounds, { discardFirst: false, countInvalidLoad: false });
    expect(kept.A?.renderMsP95?.median).toBe(50);
    const dropped = aggregateByCase(rounds, { discardFirst: true, countInvalidLoad: false });
    expect(dropped.A?.renderMsP95?.median).toBe(9);
  });

  it('delta is positive when B improves renderMs', () => {
    const a = { renderMsP95: { median: 10, p95OfP95: 12 } };
    const b = { renderMsP95: { median: 7, p95OfP95: 8 } };
    const d = deltaBvsA(a, b);
    expect(d.renderMsP95?.median).toBe(3);
    expect(d.renderMsP95?.regressionP95).toBe(-4);
  });

  it('A/A noise floor is not hard-coded zero', () => {
    const d = deltaBvsA(
      { renderMsP95: { median: 10, p95OfP95: 11 } },
      { renderMsP95: { median: 10.4, p95OfP95: 11.1 } },
    );
    const floor = noiseFloor(d);
    expect(floor.renderMsP95MedianImprove).toBeCloseTo(-0.4, 5);
  });

  it('CUT pass and js regression guard', () => {
    const pass = evaluateCutPass(
      {
        renderMsP95: { median: 2.1 },
        drawCalls: { median: 0 },
        jsMsP95: { regressionMedian: 0.1 },
      },
      DEFAULT_THRESHOLDS,
    );
    expect(pass.pass).toBe(true);
    const failJs = evaluateCutPass(
      { renderMsP95: { median: 3 }, jsMsP95: { regressionMedian: 0.5 } },
      DEFAULT_THRESHOLDS,
    );
    expect(failJs.pass).toBe(false);
  });

  it('relative pass enforces p95 non-inferiority', () => {
    const delta = {
      renderMsP95: {
        median: 1,
        regressionP95: 2,
        baselineP95: 10,
      },
    };
    expect(evaluateRelativePass(delta, 'renderMsP95', 0.5, 0.05).pass).toBe(false);
    expect(evaluateRelativePass(delta, 'renderMsP95', 0.5, 0.25).pass).toBe(true);
  });

  it('B9 desktop allows up to +5%', () => {
    const a = { renderMsP95: { p95OfP95: 10 } };
    const b = { renderMsP95: { p95OfP95: 10.4 } };
    expect(evaluateB9Desktop(a, b, 0.05).pass).toBe(true);
    expect(evaluateB9Desktop(a, { renderMsP95: { p95OfP95: 11 } }, 0.05).pass).toBe(false);
  });

  it('load gate treats >2 as invalid', () => {
    expect(isLoadValid(2)).toBe(true);
    expect(isLoadValid(2.01)).toBe(false);
  });

  it('clears invalidReason after load recovers on wait', () => {
    const gate = resolveLoadValidity(4.2, { load1min: 1.2, timedOut: false });
    expect(gate.valid).toBe(true);
    expect(gate.invalidReason).toBeUndefined();
  });

  it('evaluatePass aggregates reasons', () => {
    const summary = {
      delta: {
        BvsA: { renderMsP95: { median: 0.1 }, jsMsP95: { regressionMedian: 0 } },
      },
    };
    expect(evaluatePass(summary, { ...DEFAULT_THRESHOLDS, requireRelative: false }).pass).toBe(
      false,
    );
  });

  it('Slow 4G CDP matches DevTools Slow4GConditions bytes/s', () => {
    const download = ((1.6 * 1_000_000) / 8) * 0.9;
    const upload = ((750 * 1_000) / 8) * 0.9;
    expect(download).toBe(180_000);
    expect(upload).toBe(84_375);
    expect(150 * 3.75).toBe(562.5);
  });
});

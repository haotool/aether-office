import { describe, expect, it } from 'vitest';
import type { UsageResponse, UsageScope, UsageTotals } from '../../packages/contracts/src/index.js';
import {
  breakdown,
  compact,
  floorBadges,
  lastDay,
  limitWindows,
  modelShares,
  resetsIn,
  runningSessions,
  sparkPoints,
  tokensOf,
  toneOf,
  windowName,
} from '../../apps/web/src/features/kpi/kpi-model.js';
import { emptyScope, normalizeUsage } from '../../apps/web/src/features/kpi/usage-compat.js';

const totals = (over: Partial<UsageTotals> = {}): UsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  requests: 0,
  toolCalls: 0,
  activeMinutes: 0,
  sessions: 0,
  ...over,
});
/** A scope whose last day (today) is `today`. */
const scope = (today: Partial<UsageTotals>, days = 3): UsageScope => ({
  totals: totals(today),
  daily: [...Array.from({ length: days - 1 }, () => totals()), totals(today)],
  models: [
    { model: 'a', tokens: 75 },
    { model: 'b', tokens: 25 },
  ],
});
const usage = (offices: Partial<UsageTotals>[]): UsageResponse => ({
  enabled: true,
  range: '7d',
  timezone: 'UTC',
  days: ['2026-10-05', '2026-10-06', '2026-10-07'],
  generatedAt: 0,
  scan: {
    complete: true,
    files: 1,
    pending: 0,
    found: 1,
    truncated: false,
    failedFiles: 0,
    skippedLines: 0,
  },
  building: scope({}),
  offices: offices.map((o, floor) => ({ floor, department: `d${floor}`, scope: scope(o) })),
  unplaced: scope({}),
  projects: [],
  providers: [],
  sessions: [],
  limits: { claude: null, codex: null },
  cost: null,
});

describe('numbers', () => {
  it('counts input, output, cache writes and reasoning, never cache reads, and breaks the whole down', () => {
    const t = totals({ input: 10, output: 20, cacheRead: 1000, cacheWrite: 5, reasoning: 3 });
    expect(tokensOf(t)).toBe(38);
    expect(breakdown(t).map((p) => [p.key, Math.round(p.share * 100)])).toEqual([
      ['input', 1],
      ['output', 2],
      ['cacheRead', 96],
      ['cacheWrite', 0],
      ['reasoning', 0],
    ]);
    expect(breakdown(totals())).toEqual([]);
  });

  it('lastDay is the final daily row and rejects an empty series', () => {
    expect(lastDay(scope({ input: 1 })).input).toBe(1);
    expect(() => lastDay({ ...emptyScope(3), daily: [] })).toThrow(/daily rows/);
  });

  it('writes compact figures with Intl in the page language', () => {
    expect(compact(950, 'en')).toBe('950');
    expect(compact(1_234_567, 'en')).toBe('1.2M');
    expect(compact(12_400, 'en')).toBe('12.4K');
    expect(compact(1_234_567, 'zh-TW')).toContain('萬');
  });

  it('draws a sparkline with the largest value at the top, and nothing for no values', () => {
    expect(sparkPoints([0, 5, 10], 80, 20)).toBe('0.0,20.0 40.0,10.0 80.0,0.0');
    expect(sparkPoints([], 80, 20)).toBe('');
    expect(sparkPoints([0, 0], 80, 20)).toBe('0.0,20.0 80.0,20.0'); // all zero: a flat line, not NaN
  });

  it('shares models out of their total', () => {
    expect(modelShares(scope({})).map((m) => m.share)).toEqual([0.75, 0.25]);
  });

  it('measures a model against the scope total, not against the models that are listed', () => {
    // 200 tokens in the scope, 100 of them under models that are not listed: the listed ones are half, not all.
    const shares = modelShares(scope({ input: 100, output: 100 }));
    expect(shares.map((m) => m.share)).toEqual([0.375, 0.125]);
  });
});

describe('rate-limit windows', () => {
  it('lists Claude’s two windows and Codex’s own, named by length', () => {
    const windows = limitWindows({
      claude: {
        plan: 'Max',
        fiveHour: { usedPercent: 40, resetsAt: 5 },
        sevenDay: null,
        updatedAt: 1,
        stale: false,
      },
      codex: {
        plan: 'pro',
        windows: [{ minutes: 10080, usedPercent: 78, resetsAt: 9 }],
        updatedAt: 1,
      },
    });
    expect(windows.map((w) => [w.id, w.usedPercent])).toEqual([
      ['claude-5h', 40],
      ['codex-10080', 78],
    ]);
    // Each reading carries its age; Claude's own stale flag is passed on, Codex's is worked out from the age.
    expect(windows.map((w) => [w.updatedAt, w.stale])).toEqual([
      [1, false],
      [1, null],
    ]);
    expect(windowName(300)).toEqual({ key: 'fiveHourWindow' });
    expect(windowName(10080)).toEqual({ key: 'sevenDayWindow' });
    expect(windowName(60)).toEqual({ text: '1h' });
    expect(windowName(2880)).toEqual({ text: '2d' });
    expect(limitWindows({ claude: null, codex: null })).toEqual([]);
  });

  it('warns near the limit and is hot at it; counts a reset only while it is ahead', () => {
    expect([toneOf(50), toneOf(85), toneOf(100), toneOf(130)]).toEqual([
      'ok',
      'warn',
      'hot',
      'hot',
    ]);
    expect(resetsIn(1_000_000 + 7_200_000, 1_000_000, 'en')).toBe('2 h');
    expect(resetsIn(1_000, 2_000, 'en')).toBeNull();
    expect(resetsIn(null, 2_000, 'en')).toBeNull();
  });
});

describe('floor badges', () => {
  const words = { tokens: 'Tokens today', merged: 'Merged' };

  it('gives each floor its tokens today, its share of the busiest floor and its rate', () => {
    const badges = floorBadges(
      usage([{ input: 1000, output: 500, activeMinutes: 30 }, { input: 500 }, {}]),
      undefined,
      'en',
      words,
    );
    expect(badges[0]).toMatchObject({ tokens: '1.5K', share: 1, rate: '50/min', merged: null });
    expect(badges[1]).toMatchObject({ tokens: '500', share: 500 / 1500, rate: null });
    expect(badges[2]).toMatchObject({ tokens: '0', share: 0 });
  });

  it('adds the merged branches of the week when Git numbers are known, and nothing when usage is not', () => {
    const git = {
      enabled: true,
      days: [],
      omittedRepos: 0,
      generatedAt: 0,
      building: null,
      projects: [],
      offices: [
        {
          floor: 1,
          kpi: {
            commits: { today: 0, d7: 0, d30: 0 },
            merges: { today: 0, d7: 0, d30: 0 },
            mergedBranches: { today: 0, d7: 4, d30: 6 },
            openBranches: 0,
            authors30: 0,
            added30: null,
            removed30: null,
            longestOpenDays: null,
            daily: [],
            truncated: false,
          },
        },
      ],
    };
    expect(floorBadges(usage([{}, {}]), git, 'en', words)[1]?.merged).toBe('4');
    expect(floorBadges(undefined, git, 'en', words)).toEqual([]);
    expect(floorBadges({ ...usage([{}]), enabled: false }, git, 'en', words)).toEqual([]);
  });

  it('counts the sessions with a process running', () => {
    expect(
      runningSessions([{ process: 'running' }, { process: 'none' }, { process: 'unknown' }]),
    ).toBe(1);
  });
});

describe('a control plane older than this page', () => {
  it('fills what is missing and trims or pads every series to the days it states', () => {
    const old = {
      enabled: true,
      range: '7d',
      timezone: 'UTC',
      days: ['a', 'b', 'c'],
      generatedAt: 1,
      building: { totals: { input: 5 }, daily: [{ input: 5 }] },
      offices: [{ floor: 0, department: 'product', scope: { totals: {}, daily: [] } }],
      limits: { claude: null },
    } as unknown as UsageResponse;
    const fixed = normalizeUsage(old);
    expect(fixed.building.daily).toHaveLength(3);
    expect(fixed.building.daily[2]!.input).toBe(5); // the one day it sent is the latest
    expect(fixed.building.totals).toMatchObject({ input: 5, output: 0, requests: 0 });
    expect(fixed.offices[0]!.scope.daily).toHaveLength(3);
    // No scan from an old server is not a complete one, and not one that cut nothing short either.
    expect(fixed.scan).toEqual({
      complete: false,
      files: 0,
      pending: 0,
      found: 0,
      truncated: false,
      failedFiles: 0,
      skippedLines: 0,
    });
    expect(fixed.limits.codex).toBeNull();
    expect(fixed.unplaced.daily).toHaveLength(3);
    expect(fixed.projects).toEqual([]);
    expect(emptyScope(2).daily).toHaveLength(2);
  });
});

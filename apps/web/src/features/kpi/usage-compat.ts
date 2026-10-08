import type { GitKpiResponse, UsageResponse, UsageScope, UsageTotals } from '@aether/contracts';

const ZERO: UsageTotals = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  requests: 0,
  toolCalls: 0,
  activeMinutes: 0,
  sessions: 0,
};
export const emptyScope = (days: number): UsageScope => ({
  totals: { ...ZERO },
  daily: Array.from({ length: days }, () => ({ ...ZERO })),
  models: [],
});

const totals = (t: Partial<UsageTotals> | undefined): UsageTotals => ({ ...ZERO, ...t });
function scope(s: Partial<UsageScope> | undefined, days: number): UsageScope {
  if (!s) return emptyScope(days);
  const daily = s.daily ?? [];
  return {
    totals: totals(s.totals),
    // One entry per day, so a chart never indexes past a shorter series from an older server.
    daily: Array.from({ length: days }, (_, i) => totals(daily[daily.length - days + i])),
    models: s.models ?? [],
  };
}

/**
 * A control plane that has not been restarted since an upgrade answers with an older shape while this page is newer:
 * what was added later is filled with its "unknown" value, so one missing field cannot take the dashboard down.
 */
export function normalizeUsage(r: UsageResponse): UsageResponse {
  const days = r.days ?? [];
  return {
    ...r,
    days,
    // An older control plane sends no scan at all (or a shorter one): "unknown" is never "complete" or "not cut short".
    scan: {
      complete: r.scan?.complete ?? false,
      files: r.scan?.files ?? 0,
      pending: r.scan?.pending ?? 0,
      found: r.scan?.found ?? r.scan?.files ?? 0,
      truncated: r.scan?.truncated ?? false,
      failedFiles: r.scan?.failedFiles ?? 0,
      skippedLines: r.scan?.skippedLines ?? 0,
    },
    building: scope(r.building, days.length),
    offices: (r.offices ?? []).map((o) => ({ ...o, scope: scope(o.scope, days.length) })),
    unplaced: scope(r.unplaced, days.length),
    projects: (r.projects ?? []).map((p) => ({ ...p, scope: scope(p.scope, days.length) })),
    providers: r.providers ?? [],
    sessions: r.sessions ?? [],
    limits: { claude: r.limits?.claude ?? null, codex: r.limits?.codex ?? null },
    cost: null,
  };
}

export const normalizeGit = (r: GitKpiResponse): GitKpiResponse => ({
  ...r,
  days: r.days ?? [],
  omittedRepos: r.omittedRepos ?? 0,
  building: r.building ?? null,
  offices: r.offices ?? [],
  projects: r.projects ?? [],
});

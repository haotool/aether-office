import { z } from 'zod';

// KPIs of the local sessions: token counters from the transcripts (services/usage-stats.ts) and Git activity of the
// projects' repositories (services/git-kpi.ts). Numbers, model names and repository folder names only: no message text,
// no paths, no commit subjects.
const count = z.number().int().nonnegative();

/** What one scope (the building, an office, a project) used. Output excludes reasoning; input excludes cache reads. */
export const usageTotalsSchema = z.object({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
  reasoning: count,
  /** Model requests: an assistant message (Claude) or a token_count that moved (Codex). */
  requests: count,
  toolCalls: count,
  /** Session-minutes: gaps of at most five minutes between a transcript's events, summed over sessions. */
  activeMinutes: count,
  sessions: count,
});
export type UsageTotals = z.infer<typeof usageTotalsSchema>;

export const usageScopeSchema = z.object({
  totals: usageTotalsSchema,
  /** One entry per day of `UsageResponse.days`, oldest first. */
  daily: z.array(usageTotalsSchema).max(31),
  /** Tokens (without cache reads) per model over the range, largest first. */
  models: z.array(z.object({ model: z.string().max(80), tokens: count })).max(12),
});
export type UsageScope = z.infer<typeof usageScopeSchema>;

const limitWindowSchema = z.object({
  /** The window's length: 300 is the 5-hour window, 10080 the weekly one. */
  minutes: z.number().nullable(),
  usedPercent: z.number(),
  resetsAt: z.number().nullable(),
});
export const codexLimitsSchema = z.object({
  plan: z.string().nullable(),
  windows: z.array(limitWindowSchema).max(4),
  updatedAt: z.number(),
});
export type CodexLimits = z.infer<typeof codexLimitsSchema>;

export const usageResponseSchema = z.object({
  /** False while local session discovery is switched off. */
  enabled: z.boolean(),
  range: z.enum(['today', '7d', '30d']),
  timezone: z.string(),
  /** Local calendar days (YYYY-MM-DD), oldest first; the last is today. */
  days: z.array(z.string()).max(31),
  generatedAt: z.number(),
  /** The first scan reads history in slices: until it is complete the numbers are a lower bound. */
  scan: z.object({ complete: z.boolean(), files: count, pending: count }),
  building: usageScopeSchema,
  /** One per department, by floor; a department with no usage is still listed. */
  offices: z.array(z.object({ floor: count, department: z.string(), scope: usageScopeSchema })),
  /** Usage of sessions that no department was assigned to (older than the session list's window). */
  unplaced: usageScopeSchema,
  projects: z.array(z.object({ repo: z.string().max(120), scope: usageScopeSchema })).max(12),
  providers: z.array(
    z.object({ provider: z.enum(['claude', 'codex']), totals: usageTotalsSchema }),
  ),
  sessions: z
    .array(
      z.object({
        key: z.string(),
        provider: z.enum(['claude', 'codex']),
        repo: z.string().max(120),
        department: z.string().nullable(),
        model: z.string().max(80).nullable(),
        tokens: count,
        requests: count,
        activeMinutes: count,
      }),
    )
    .max(10),
  limits: z.object({
    claude: z
      .object({
        plan: z.string().nullable(),
        fiveHour: z.object({ usedPercent: z.number(), resetsAt: z.number().nullable() }).nullable(),
        sevenDay: z.object({ usedPercent: z.number(), resetsAt: z.number().nullable() }).nullable(),
        updatedAt: z.number(),
        stale: z.boolean(),
      })
      .nullable(),
    codex: codexLimitsSchema.nullable(),
  }),
  /** Always null: no price table is available on this machine, so nothing is estimated. */
  cost: z.null(),
});
export type UsageResponse = z.infer<typeof usageResponseSchema>;

const windowedCount = z.object({ today: count, d7: count, d30: count });
export const gitKpiSchema = z.object({
  commits: windowedCount,
  /** Merge commits. */
  merges: windowedCount,
  /** Branches that became part of the default branch: by a merge commit, or fast-forwarded and still listed. */
  mergedBranches: windowedCount,
  openBranches: count,
  authors30: count,
  /** Lines added and removed by the last 30 days' commits; null when counting them was too slow. */
  added30: count.nullable(),
  removed30: count.nullable(),
  /** Age in days of the oldest unmerged branch's first commit; null when there is no open branch. */
  longestOpenDays: z.number().nullable(),
  /** Commits per day of `UsageResponse.days`. */
  daily: z.array(count).max(31),
});
export type GitKpi = z.infer<typeof gitKpiSchema>;

export const gitKpiResponseSchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.string()).max(31),
  generatedAt: z.number(),
  building: gitKpiSchema.nullable(),
  offices: z.array(z.object({ floor: count, kpi: gitKpiSchema.nullable() })),
  projects: z.array(
    z.object({ projectId: z.string(), repo: z.string().max(120), kpi: gitKpiSchema.nullable() }),
  ),
});
export type GitKpiResponse = z.infer<typeof gitKpiResponseSchema>;

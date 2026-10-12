import { z } from 'zod';

// Numbers, model names and repository folder names only: no message text, no paths, no commit subjects.
const count = z.number().int().nonnegative();

/** What one scope (the building, an office, a project) used. Output excludes reasoning; input excludes cache reads. */
const usageTotalsSchema = z.object({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
  reasoning: count,
  requests: count,
  toolCalls: count,
  /** Session-minutes: gaps of at most five minutes between a transcript's events, summed over sessions: parallel sessions overlap, so this can exceed the wall clock. */
  activeMinutes: count,
  sessions: count,
});
export type UsageTotals = z.infer<typeof usageTotalsSchema>;

const usageScopeSchema = z.object({
  totals: usageTotalsSchema,
  daily: z.array(usageTotalsSchema).max(31),
  models: z.array(z.object({ model: z.string().max(80), tokens: count })).max(12),
});
export type UsageScope = z.infer<typeof usageScopeSchema>;

const limitWindowSchema = z.object({
  minutes: z.number().nullable(),
  usedPercent: z.number(),
  resetsAt: z.number().nullable(),
});
const codexLimitsSchema = z.object({
  plan: z.string().nullable(),
  windows: z.array(limitWindowSchema).max(4),
  updatedAt: z.number(),
});
export type CodexLimits = z.infer<typeof codexLimitsSchema>;

export const usageResponseSchema = z.object({
  enabled: z.boolean(),
  range: z.enum(['today', '7d', '30d']),
  timezone: z.string(),
  days: z.array(z.string()).max(31),
  generatedAt: z.number(),
  scan: z.object({
    complete: z.boolean(),
    files: count,
    pending: count,
    found: count,
    truncated: z.boolean(),
    failedFiles: count,
    skippedLines: count,
  }),
  building: usageScopeSchema,
  offices: z.array(z.object({ floor: count, department: z.string(), scope: usageScopeSchema })),
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
  cost: z.null(),
});
export type UsageResponse = z.infer<typeof usageResponseSchema>;

const windowedCount = z.object({ today: count, d7: count, d30: count });
const gitKpiSchema = z.object({
  commits: windowedCount,
  merges: windowedCount,
  mergedBranches: windowedCount,
  openBranches: count,
  authors30: count,
  added30: count.nullable(),
  removed30: count.nullable(),
  longestOpenDays: z.number().nullable(),
  daily: z.array(count).max(31),
  truncated: z.boolean(),
});
export type GitKpi = z.infer<typeof gitKpiSchema>;

export const gitKpiResponseSchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.string()).max(31),
  generatedAt: z.number(),
  omittedRepos: count,
  building: gitKpiSchema.nullable(),
  offices: z.array(z.object({ floor: count, kpi: gitKpiSchema.nullable() })),
  projects: z.array(
    z.object({ projectId: z.string(), repo: z.string().max(120), kpi: gitKpiSchema.nullable() }),
  ),
});
export type GitKpiResponse = z.infer<typeof gitKpiResponseSchema>;

import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEPARTMENTS } from '@aether/kernel';
import type { GitKpi, GitKpiResponse, UsageResponse } from '@aether/contracts';
import { z } from 'zod';
import { readClaudeLimits } from '../services/platform/claude-limits.js';
import { gitKpi, sumKpis } from '../services/git/git-kpi.js';
import { attributeSessions, scanLocalSessions } from '../services/runtime/local-sessions.js';
import { mapPool } from '../services/runtime/pool.js';
import { windowDays, type Attribution } from '../services/usage/usage-aggregate.js';
import { dayKeyOf } from '../services/usage/usage-parse.js';
import { createUsageStats, type UsageStats } from '../services/usage/usage-stats.js';
import { requireOperator, type RouteContext } from './context.js';

const query = z.object({ range: z.enum(['today', '7d', '30d']).default('7d') });
/** How long a request waits for a scan still reading history before it answers with what is known. */
const WAIT_MS = 400;
const MAX_REPOS = 12;
const GIT_WIDTH = 3;
const DAY_MS = 86_400_000;
const localHome = () => process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir();
const off = () => process.env['AETHER_LOCAL_SESSIONS'] === 'off';

type Who = Parameters<RouteContext['control']['listProjects']>[0];
type Sessions = Awaited<ReturnType<typeof attributeSessions>>;

/** One usage tracker per home directory, created on first use. */
function usageStatsStore(dataDir: string | undefined) {
  const stats = new Map<string, UsageStats>();
  return (home: string) => {
    let one = stats.get(home);
    if (!one) {
      one = createUsageStats({
        home,
        cacheFile: dataDir ? join(dataDir, 'usage-rollup.json') : null,
      });
      stats.set(home, one);
    }
    return one;
  };
}

/** The projects with a repository, the most recently worked in first, and the newest session time of each. */
function rankProjects(
  projects: ReturnType<RouteContext['control']['listProjects']>,
  sessions: Sessions,
) {
  const withRoot = new Map(
    projects.flatMap((p) => (p.root ? [[p.id, { ...p, root: p.root }] as const] : [])),
  );
  const latest = new Map<string, number>();
  for (const s of sessions)
    if (s.projectId && withRoot.has(s.projectId))
      latest.set(s.projectId, Math.max(latest.get(s.projectId) ?? 0, s.mtime));
  return [...withRoot.values()].sort((a, b) => (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0));
}

// Commits, merges and branches per project, per office (the projects its sessions work in) and for the building.
async function gitUsage(
  { control }: RouteContext,
  who: Who,
  timeZone: string,
  sessionsOf: (who: Who) => Promise<Sessions>,
): Promise<GitKpiResponse> {
  const dayOf = dayKeyOf(timeZone); // the zone the token days follow, so the two agree
  const days = windowDays(dayOf(Date.now()));
  const base = { days, generatedAt: Date.now() };
  if (off())
    return { enabled: false, ...base, omittedRepos: 0, building: null, offices: [], projects: [] };
  const sessions = (await sessionsOf(who)).filter((s) => Date.now() - s.mtime < 30 * DAY_MS);
  const ranked = rankProjects(control.listProjects(who), sessions);
  const chosen = ranked.slice(0, MAX_REPOS);
  const results = new Map<string, GitKpi | null>(
    await mapPool(
      chosen,
      GIT_WIDTH,
      async (p) => [p.id, await gitKpi(p.root, days, dayOf)] as const,
    ),
  );
  const sum = (ids: Iterable<string>) => sumKpis([...ids].flatMap((id) => results.get(id) ?? []));
  return {
    enabled: true,
    ...base,
    omittedRepos: ranked.length - chosen.length,
    building: sum(results.keys()),
    offices: DEPARTMENTS.map((d) => ({
      floor: d.floor,
      kpi: sum(
        new Set(
          sessions.flatMap((s) =>
            s.classification.department === d.id && s.projectId ? [s.projectId] : [],
          ),
        ),
      ),
    })),
    projects: chosen.map((p) => ({
      projectId: p.id,
      repo: p.name,
      kpi: results.get(p.id) ?? null,
    })),
  };
}

/** Token KPIs and Git KPIs of the local sessions, for the office's dashboards. Owner and operator only; read-only. */
export function usageRoutes(context: RouteContext) {
  const { app, control, actor, options } = context;
  const statsFor = usageStatsStore(options.dataDir);
  const sessionsOf = async (who: Who) =>
    attributeSessions(await scanLocalSessions(localHome()), control.listProjects(who));

  app.get('/api/usage', async (request): Promise<UsageResponse> => {
    const who = actor(request);
    requireOperator(who);
    const { range } = query.parse(request.query);
    const one = statsFor(localHome());
    const claude = await readClaudeLimits();
    if (off()) return { ...(await one.snapshot(range, new Map(), claude, true)), enabled: false };
    const sessions = await sessionsOf(who);
    await one.refresh(WAIT_MS);
    const attributions = new Map<string, Attribution>(
      sessions.map((s) => [s.key, { department: s.classification.department, repo: s.repo }]),
    );
    return one.snapshot(range, attributions, claude);
  });
  app.get('/api/usage/git', async (request): Promise<GitKpiResponse> => {
    const who = actor(request);
    requireOperator(who);
    return gitUsage(context, who, statsFor(localHome()).timeZone, sessionsOf);
  });
}

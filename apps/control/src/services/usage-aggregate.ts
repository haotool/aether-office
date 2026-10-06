import { DEPARTMENTS } from '@aether/kernel';
import type { UsageResponse, UsageScope, UsageTotals } from '@aether/contracts';
import { fresh, type Bucket } from './usage-parse.js';
import type { Entry } from './usage-store.js';
import type { Transcript } from './usage-files.js';

// Turns what was read of each transcript (a bucket per file per day) into the numbers a person looks at: the building,
// each office (department), each project and the heaviest sessions, per day and over a range. Pure.

export type Attribution = { department: string | null; repo: string };
export type Tracked = { transcript: Transcript; entry: Entry };
export const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30 } as const;
export const WINDOW_DAYS = 30;
const MAX_PROJECTS = 12;
const MAX_SESSIONS = 10;
const MAX_MODELS = 12;

const empty = (): UsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  requests: 0,
  toolCalls: 0,
  activeMinutes: 0,
  sessions: 0,
});

/** Tokens the headline counts: everything but cache reads. */
export const tokensOf = (t: UsageTotals) => t.input + t.output + t.cacheWrite + t.reasoning;

function add(into: UsageTotals, b: Bucket, ms: { carry: number }) {
  into.input += b.i;
  into.output += b.o;
  into.cacheRead += b.cr;
  into.cacheWrite += b.cw;
  into.reasoning += b.r;
  into.requests += b.req;
  into.toolCalls += b.tools;
  ms.carry += b.ms; // minutes are rounded once per scope and day, not per file
}

/** One scope's running sums: a total per day, the sessions seen each day, and tokens per model over the range. */
class Scope {
  daily: UsageTotals[];
  private millis: { carry: number }[];
  private seen: Set<string>[];
  private rangeSeen = new Set<string>();
  models = new Map<string, number>();
  constructor(days: number) {
    this.daily = Array.from({ length: days }, empty);
    this.millis = Array.from({ length: days }, () => ({ carry: 0 }));
    this.seen = Array.from({ length: days }, () => new Set());
  }
  take(index: number, b: Bucket, session: string, inRange: boolean) {
    add(this.daily[index]!, b, this.millis[index]!);
    this.seen[index]!.add(session);
    if (!inRange) return;
    this.rangeSeen.add(session);
    for (const [model, tokens] of Object.entries(b.m))
      this.models.set(model, (this.models.get(model) ?? 0) + tokens);
  }
  tokens(from: number) {
    return this.daily.slice(from).reduce((n, d) => n + tokensOf(d), 0);
  }
  result(from: number): UsageScope {
    const daily = this.daily.map((d, i) => ({
      ...d,
      activeMinutes: Math.round(this.millis[i]!.carry / 60_000),
      sessions: this.seen[i]!.size,
    }));
    const totals = daily.slice(from).reduce((sum, d) => {
      for (const key of Object.keys(sum) as (keyof UsageTotals)[]) sum[key] += d[key];
      return sum;
    }, empty());
    totals.sessions = this.rangeSeen.size;
    return {
      totals,
      daily,
      models: [...this.models]
        .map(([model, tokens]) => ({ model, tokens }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, MAX_MODELS),
    };
  }
}

type Row = {
  tokens: number;
  req: number;
  ms: number;
  models: Map<string, number>;
  at: Attribution;
  provider: 'claude' | 'codex';
};

/** The last `WINDOW_DAYS` calendar days ending at `today` (YYYY-MM-DD), by calendar arithmetic, never by 24-hour steps. */
export function windowDays(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return Array.from({ length: WINDOW_DAYS }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (WINDOW_DAYS - 1 - i))).toISOString().slice(0, 10),
  );
}

export function aggregate(input: {
  tracked: readonly Tracked[];
  today: string;
  range: UsageResponse['range'];
  attributions: ReadonlyMap<string, Attribution>;
  timezone: string;
  generatedAt: number;
  scan: UsageResponse['scan'];
  limits: UsageResponse['limits'];
}): UsageResponse {
  const days = windowDays(input.today);
  const index = new Map(days.map((d, i) => [d, i]));
  const from = WINDOW_DAYS - RANGE_DAYS[input.range];
  const building = new Scope(WINDOW_DAYS);
  const offices = new Map(DEPARTMENTS.map((d) => [d.id as string, new Scope(WINDOW_DAYS)]));
  const unplaced = new Scope(WINDOW_DAYS);
  const projects = new Map<string, Scope>();
  const providers = { claude: new Scope(WINDOW_DAYS), codex: new Scope(WINDOW_DAYS) };
  const rows = new Map<string, Row>();
  for (const { transcript, entry } of input.tracked) {
    const at = input.attributions.get(transcript.sessionKey) ?? {
      department: null,
      repo: entry.repo ?? 'unknown',
    };
    const office = (at.department && offices.get(at.department)) || unplaced;
    const project =
      projects.get(at.repo) ?? projects.set(at.repo, new Scope(WINDOW_DAYS)).get(at.repo)!;
    for (const [day, b] of Object.entries(entry.state.days)) {
      const i = index.get(day);
      if (i === undefined) continue;
      const inRange = i >= from;
      const session = transcript.sessionKey;
      for (const scope of [building, office, project, providers[transcript.provider]])
        scope.take(i, b, session, inRange);
      if (!inRange) continue;
      const row =
        rows.get(session) ??
        rows
          .set(session, {
            tokens: 0,
            req: 0,
            ms: 0,
            models: new Map(),
            at,
            provider: transcript.provider,
          })
          .get(session)!;
      row.tokens += fresh(b);
      row.req += b.req;
      row.ms += b.ms;
      for (const [model, tokens] of Object.entries(b.m))
        row.models.set(model, (row.models.get(model) ?? 0) + tokens);
    }
  }
  const topModel = (models: Map<string, number>) =>
    [...models].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    enabled: true,
    range: input.range,
    timezone: input.timezone,
    days,
    generatedAt: input.generatedAt,
    scan: input.scan,
    building: building.result(from),
    offices: DEPARTMENTS.map((d) => ({
      floor: d.floor,
      department: d.id,
      scope: offices.get(d.id)!.result(from),
    })),
    unplaced: unplaced.result(from),
    projects: [...projects]
      .filter(([, scope]) => scope.tokens(from) > 0)
      .sort((a, b) => b[1].tokens(from) - a[1].tokens(from))
      .slice(0, MAX_PROJECTS)
      .map(([repo, scope]) => ({ repo, scope: scope.result(from) })),
    providers: (['claude', 'codex'] as const).map((provider) => ({
      provider,
      totals: providers[provider].result(from).totals,
    })),
    sessions: [...rows]
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, MAX_SESSIONS)
      .filter(([, r]) => r.tokens > 0)
      .map(([key, r]) => ({
        key,
        provider: r.provider,
        repo: r.at.repo,
        department: r.at.department,
        model: topModel(r.models),
        tokens: r.tokens,
        requests: r.req,
        activeMinutes: Math.round(r.ms / 60_000),
      })),
    limits: input.limits,
    cost: null,
  };
}

import { DEPARTMENTS } from '@aether/kernel';
import type { UsageResponse, UsageScope, UsageTotals } from '@aether/contracts';
import { fresh, type Bucket } from './usage-parse.js';
import type { Entry } from './usage-store.js';
import type { Transcript } from './usage-files.js';

// Turns what was read of each transcript (a bucket per file per day) into the numbers a person looks at: the building,
// each office (department), each project and the heaviest sessions, per day and over a range. Pure.

export type Attribution = { department: string | null; repo: string };
export type Tracked = { transcript: Transcript; entry: Entry };
const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30 } as const;
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
const tokensOf = (t: UsageTotals) => t.input + t.output + t.cacheWrite + t.reasoning;

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

type Day = { totals: UsageTotals; millis: { carry: number }; seen: Set<string> };

/** One scope's running sums: a total per day, the sessions seen each day, and tokens per model over the range. */
class Scope {
  private days: Day[];
  private rangeSeen = new Set<string>();
  models = new Map<string, number>();
  constructor(days: number) {
    this.days = Array.from({ length: days }, () => ({
      totals: empty(),
      millis: { carry: 0 },
      seen: new Set<string>(),
    }));
  }
  take(index: number, b: Bucket, session: string, inRange: boolean) {
    const day = this.days[index];
    if (!day) return;
    add(day.totals, b, day.millis);
    day.seen.add(session);
    if (!inRange) return;
    this.rangeSeen.add(session);
    for (const [model, tokens] of Object.entries(b.m))
      this.models.set(model, (this.models.get(model) ?? 0) + tokens);
  }
  tokens(from: number) {
    return this.days.slice(from).reduce((n, d) => n + tokensOf(d.totals), 0);
  }
  result(from: number): UsageScope {
    const daily = this.days.map((d) => ({
      ...d.totals,
      activeMinutes: Math.round(d.millis.carry / 60_000),
      sessions: d.seen.size,
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

type AggregateInput = {
  tracked: readonly Tracked[];
  today: string;
  range: UsageResponse['range'];
  attributions: ReadonlyMap<string, Attribution>;
  timezone: string;
  generatedAt: number;
  scan: UsageResponse['scan'];
  limits: UsageResponse['limits'];
};

const getOrCreate = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
  const found = map.get(key);
  if (found !== undefined) return found;
  const made = make();
  map.set(key, made);
  return made;
};

/** Every scope of the answer, filled from what was read. */
function fold(input: AggregateInput, days: string[], from: number) {
  const index = new Map(days.map((d, i) => [d, i]));
  const building = new Scope(WINDOW_DAYS);
  const offices = DEPARTMENTS.map((d) => ({ d, scope: new Scope(WINDOW_DAYS) }));
  const officeOf = new Map(offices.map((o) => [o.d.id as string, o.scope]));
  const unplaced = new Scope(WINDOW_DAYS);
  const projects = new Map<string, Scope>();
  const providers = { claude: new Scope(WINDOW_DAYS), codex: new Scope(WINDOW_DAYS) };
  const rows = new Map<string, Row>();
  for (const { transcript, entry } of input.tracked) {
    // A Codex subagent's rollout belongs to the session that spawned it, as a Claude subagent's file does.
    const session = entry.parent ? `codex:${entry.parent}` : transcript.sessionKey;
    const at = input.attributions.get(session) ?? {
      department: null,
      repo: entry.repo ?? 'unknown',
    };
    const office = (at.department && officeOf.get(at.department)) || unplaced;
    const project = getOrCreate(projects, at.repo, () => new Scope(WINDOW_DAYS));
    for (const [day, b] of Object.entries(entry.state.days)) {
      const i = index.get(day);
      if (i === undefined) continue;
      const inRange = i >= from;
      for (const scope of [building, office, project, providers[transcript.provider]])
        scope.take(i, b, session, inRange);
      if (!inRange) continue;
      const row = getOrCreate(rows, session, () => ({
        tokens: 0,
        req: 0,
        ms: 0,
        models: new Map(),
        at,
        provider: transcript.provider,
      }));
      row.tokens += fresh(b);
      row.req += b.req;
      row.ms += b.ms;
      for (const [model, tokens] of Object.entries(b.m))
        row.models.set(model, (row.models.get(model) ?? 0) + tokens);
    }
  }
  return { building, offices, unplaced, projects, providers, rows };
}

const topModel = (models: Map<string, number>) =>
  [...models].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

export function aggregate(input: AggregateInput): UsageResponse {
  const days = windowDays(input.today);
  const from = WINDOW_DAYS - RANGE_DAYS[input.range];
  const { building, offices, unplaced, projects, providers, rows } = fold(input, days, from);
  return {
    enabled: true,
    range: input.range,
    timezone: input.timezone,
    days,
    generatedAt: input.generatedAt,
    scan: input.scan,
    building: building.result(from),
    offices: offices.map(({ d, scope }) => ({
      floor: d.floor,
      department: d.id,
      scope: scope.result(from),
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

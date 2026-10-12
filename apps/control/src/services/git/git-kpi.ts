import { createHash } from 'node:crypto';
import type { GitKpi } from '@aether/contracts';
import { defaultBranch, git } from './git-health.js';
import { mapPool } from '../runtime/pool.js';
import type { DayOf } from '../usage/usage-counters.js';

const KPI_TTL_MS = 60_000;
const MAX_COMMITS = 5000;
const STAT_COMMITS = 2000;
const MAX_OPEN_AGES = 25;
const AGE_WIDTH = 4;
const AGE_COMMITS = 500;
const DAY_MS = 86_400_000;
const GIT_TIMEOUT_MS = 8000;

type Branch = { name: string; sha: string; at: number };
type Raw = {
  base: string;
  branches: Branch[];
  merged: Set<string>;
  commits: { at: number; author: string }[];
  baseMerges: { at: number; tip: string }[];
  lines: { added: number; removed: number } | null;
  truncated: boolean;
  worked: Set<string>;
  openSince: number[];
};

const lines = (text: string) => text.split('\n').filter(Boolean);

export function parseBranches(text: string): Branch[] {
  return lines(text).flatMap((line) => {
    const [name, sha, at] = line.split('\t');
    return name && sha ? [{ name, sha, at: Number(at) * 1000 || 0 }] : [];
  });
}

export function parseShortstat(text: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines(text)) {
    added += Number(/(\d+) insertions?\(\+\)/.exec(line)?.[1] ?? 0);
    removed += Number(/(\d+) deletions?\(-\)/.exec(line)?.[1] ?? 0);
  }
  return { added, removed };
}

export function buildKpi(raw: Raw, days: readonly string[], dayOf: DayOf, now: number): GitKpi {
  const slot = (at: number) => days.indexOf(dayOf(at));
  const windowed = (times: readonly number[]) => {
    const out = { today: 0, d7: 0, d30: 0 };
    for (const at of times) {
      const i = slot(at);
      if (i < 0) continue;
      out.d30++;
      if (i >= days.length - 7) out.d7++;
      if (i === days.length - 1) out.today++;
    }
    return out;
  };
  const daily = days.map(() => 0);
  for (const c of raw.commits) {
    const i = slot(c.at);
    if (i >= 0) daily[i] = (daily[i] ?? 0) + 1;
  }
  const tips = new Set(raw.baseMerges.map((m) => m.tip));
  const baseTip = raw.branches.find((b) => b.name === raw.base)?.sha;
  // A branch merged by a fast-forward leaves no merge commit: it counts when it is still listed, merged, and has work of
  // its own (a branch on the default branch's tip is that only if its reflog shows it moved; a fresh one never did).
  const fastForwarded = raw.branches.filter(
    (b) =>
      b.name !== raw.base &&
      raw.merged.has(b.name) &&
      !tips.has(b.sha) &&
      (b.sha !== baseTip || raw.worked.has(b.name)),
  );
  const open = raw.branches.filter((b) => b.name !== raw.base && !raw.merged.has(b.name));
  const oldest = Math.min(...raw.openSince);
  return {
    commits: windowed(raw.commits.map((c) => c.at)),
    merges: windowed(raw.baseMerges.map((m) => m.at)),
    mergedBranches: windowed([
      ...raw.baseMerges.map((m) => m.at),
      ...fastForwarded.map((b) => b.at),
    ]),
    openBranches: open.length,
    authors30: new Set(raw.commits.map((c) => c.author)).size,
    added30: raw.lines?.added ?? null,
    removed30: raw.lines?.removed ?? null,
    longestOpenDays: raw.openSince.length ? Math.max(0, Math.floor((now - oldest) / DAY_MS)) : null,
    daily,
    truncated: raw.truncated,
  };
}

async function readLogs(root: string, base: string, since: string) {
  const [merged, log, merges, stat] = await Promise.all([
    git(root, ['branch', '--merged', base, '--format=%(refname:short)'], GIT_TIMEOUT_MS).catch(
      () => '',
    ),
    git(
      root,
      ['log', '--branches', since, '-n', String(MAX_COMMITS), '--format=%ct%x09%ae'],
      GIT_TIMEOUT_MS,
    ).catch(() => ''),
    git(
      root,
      [
        'log',
        base,
        '--first-parent',
        '--merges',
        since,
        '-n',
        String(MAX_COMMITS),
        '--format=%ct%x09%P',
      ],
      GIT_TIMEOUT_MS,
    ).catch(() => ''),
    git(
      root,
      [
        'log',
        '--branches',
        '--no-merges',
        since,
        '-n',
        String(STAT_COMMITS),
        '--shortstat',
        '--format=%x01',
      ],
      GIT_TIMEOUT_MS,
    ).then(
      (text) => ({ ...parseShortstat(text), commits: text.split('\x01').length - 1 }),
      () => null,
    ),
  ]);
  return { merged, log, merges, stat };
}

async function workedBranches(root: string, branches: Branch[], base: string, merged: Set<string>) {
  const baseTip = branches.find((b) => b.name === base)?.sha;
  const atTip = branches
    .filter((b) => b.name !== base && merged.has(b.name) && b.sha === baseTip)
    .slice(0, MAX_OPEN_AGES);
  const names = await mapPool(atTip, AGE_WIDTH, async (b) => {
    const out = await git(
      root,
      ['reflog', 'show', '--format=%H', `refs/heads/${b.name}`],
      GIT_TIMEOUT_MS,
    ).catch(() => '');
    return lines(out).length > 1 ? b.name : null;
  });
  return new Set(names.filter((name): name is string => name !== null));
}

async function openBranchStarts(
  root: string,
  branches: Branch[],
  base: string,
  merged: Set<string>,
) {
  const open = branches
    .filter((b) => b.name !== base && !merged.has(b.name))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_OPEN_AGES);
  const starts = await mapPool(open, AGE_WIDTH, async (b) => {
    const out = await git(
      root,
      ['log', `${base}..${b.name}`, '-n', String(AGE_COMMITS), '--format=%ct'],
      GIT_TIMEOUT_MS,
    ).catch(() => '');
    const oldest = lines(out).at(-1);
    return oldest ? Number(oldest) * 1000 : null;
  });
  return starts.filter((at): at is number => at !== null);
}

async function collect(
  root: string,
  branchesText: string,
  base: string,
  sinceIso: string,
): Promise<Raw> {
  const branches = parseBranches(branchesText);
  const { merged, log, merges, stat } = await readLogs(root, base, `--since=${sinceIso}`);
  const mergedSet = new Set(lines(merged));
  const worked = await workedBranches(root, branches, base, mergedSet);
  const openSince = await openBranchStarts(root, branches, base, mergedSet);
  return {
    base,
    branches,
    merged: mergedSet,
    commits: lines(log).map((line) => {
      const [at, author] = line.split('\t');
      return { at: Number(at) * 1000, author: author ?? '' };
    }),
    baseMerges: lines(merges).flatMap((line) => {
      const [at, parents] = line.split('\t');
      const tip = (parents ?? '').split(' ')[1]; // the second parent is the branch that was merged in
      return tip ? [{ at: Number(at) * 1000, tip }] : [];
    }),
    lines: stat && { added: stat.added, removed: stat.removed },
    truncated:
      lines(log).length >= MAX_COMMITS ||
      lines(merges).length >= MAX_COMMITS ||
      (stat?.commits ?? 0) >= STAT_COMMITS,
    worked,
    openSince,
  };
}

const cache = new Map<string, { sig: string; at: number; day: string; kpi: GitKpi }>();
const MAX_CACHED = 64;

export async function gitKpi(
  root: string,
  days: readonly string[],
  dayOf: DayOf,
  now = Date.now(),
): Promise<GitKpi | null> {
  const today = days.at(-1);
  if (!today) return null;
  const hit = cache.get(root);
  if (hit && hit.day === today && now - hit.at < KPI_TTL_MS) return hit.kpi;
  try {
    const base = await defaultBranch(root);
    const branchesText = await git(
      root,
      [
        'for-each-ref',
        '--format=%(refname:short)%09%(objectname)%09%(committerdate:unix)',
        'refs/heads',
      ],
      GIT_TIMEOUT_MS,
    );
    if (!branchesText.trim()) return null;
    const sig = createHash('sha1').update(`${base}\n${branchesText}`).digest('hex');
    if (hit && hit.sig === sig && hit.day === today) {
      cache.set(root, { ...hit, at: now });
      return hit.kpi;
    }
    const sinceIso = new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY_MS).toISOString();
    const kpi = buildKpi(await collect(root, branchesText, base, sinceIso), days, dayOf, now);
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(root, { sig, at: now, day: today, kpi });
    return kpi;
  } catch {
    return null;
  }
}

export const resetGitKpiCache = () => cache.clear();

const sumWindowed = (list: readonly GitKpi['commits'][]) => ({
  today: list.reduce((n, w) => n + w.today, 0),
  d7: list.reduce((n, w) => n + w.d7, 0),
  d30: list.reduce((n, w) => n + w.d30, 0),
});
const sumLines = (list: readonly (number | null)[]) =>
  list.some((n) => n !== null) ? list.reduce<number>((n, v) => n + (v ?? 0), 0) : null;

export function sumKpis(list: readonly GitKpi[]): GitKpi | null {
  const [first] = list;
  if (!first) return null;
  const ages = list.flatMap((k) => (k.longestOpenDays === null ? [] : [k.longestOpenDays]));
  return {
    commits: sumWindowed(list.map((k) => k.commits)),
    merges: sumWindowed(list.map((k) => k.merges)),
    mergedBranches: sumWindowed(list.map((k) => k.mergedBranches)),
    openBranches: list.reduce((n, k) => n + k.openBranches, 0),
    authors30: list.reduce((n, k) => n + k.authors30, 0),
    added30: sumLines(list.map((k) => k.added30)),
    removed30: sumLines(list.map((k) => k.removed30)),
    longestOpenDays: ages.length ? Math.max(...ages) : null,
    daily: first.daily.map((_, i) => list.reduce((n, k) => n + (k.daily[i] ?? 0), 0)),
    truncated: list.some((k) => k.truncated),
  };
}

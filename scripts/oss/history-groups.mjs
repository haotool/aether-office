// Reads a repository's commits and groups them into milestones for the open-source history plan (scripts/oss).
import { git } from './git-messages.mjs';

const FIELD = '\x00';
const RECORD = '\x01';

/** Every commit reachable from `rev`, newest first: hash, parents, author, committer and the full message. */
export function readCommits(repo, rev = 'HEAD') {
  const [f, r] = ['%x00', '%x01'];
  const format = `${r}%H${f}%P${f}%an${f}%ae${f}%ad${f}%cn${f}%ce${f}%cd${f}%B`;
  const out = git(repo, ['log', '--date=raw', `--format=${format}`, rev]);
  return out
    .split(RECORD)
    .slice(1)
    .map((record) => {
      const [
        hash = '',
        parents = '',
        an = '',
        ae = '',
        ad = '',
        cn = '',
        ce = '',
        cd = '',
        ...message
      ] = record.split(FIELD);
      const text = message.join(FIELD).replace(/\n+$/, '');
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author: { name: an, email: ae, date: ad },
        committer: { name: cn, email: ce, date: cd },
        subject: text.split('\n')[0] ?? '',
        message: text,
        day: dayOf(ad),
      };
    });
}

/** Changed lines (insertions plus deletions) per non-merge commit, used to pick the headline commit of a group. */
export function commitSizes(repo, rev = 'HEAD') {
  const sizes = new Map();
  const out = git(repo, ['log', '--no-merges', '--shortstat', '--format=%x01%H', rev]);
  for (const record of out.split('\x01').slice(1)) {
    const [hash = '', ...rest] = record.split('\n');
    const text = rest.join(' ');
    const n = (re) => Number(re.exec(text)?.[1] ?? 0);
    sizes.set(hash.trim(), n(/(\d+) insertion/) + n(/(\d+) deletion/));
  }
  return sizes;
}

/** `YYYY-MM-DD` of a raw git date (`<unix> <+hhmm>`), in the author's own offset. */
export function dayOf(raw) {
  const [ts = '0', tz = '+0000'] = raw.split(' ');
  const offset =
    (tz.startsWith('-') ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60;
  return new Date((Number(ts) + offset) * 1000).toISOString().slice(0, 10);
}

/** Commits at or below an upstream (non-maintainer) author: their whole ancestry is upstream. */
export function upstreamSet(commits, maintainerEmails) {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const maintainers = new Set(maintainerEmails.map((e) => e.toLowerCase()));
  const upstream = new Set();
  const stack = commits
    .filter((c) => !maintainers.has(c.author.email.toLowerCase()))
    .map((c) => c.hash);
  while (stack.length) {
    const hash = stack.pop();
    if (upstream.has(hash)) continue;
    upstream.add(hash);
    for (const p of byHash.get(hash)?.parents ?? []) stack.push(p);
  }
  return upstream;
}

// ---------------------------------------------------------------------------------------------------------------
// Milestones

const theme = (id, label, re) => ({ id, label, re });
/** Ordered: the first matching theme wins. Override by passing `themes` to `groupUnits`. */
export const THEMES = [
  theme('docs', 'documentation and ledger', (u) => u.type === 'docs'),
  theme('refactor', 'module splits and cleanup', (u) => u.type === 'refactor'),
  theme(
    'security',
    'security and approvals',
    /approval|ssrf|bearer|redact|harden|csrf|pairing|qr code|secret|credential|invitation|permission|authenticat|role-by-action/,
  ),
  theme(
    'animals',
    'animals and animation',
    /animal|tail|chair|paw|forearm|avatar|jiangshi|ghost|sleeping|models? regenerated|blender|rim light|expressions/,
  ),
  theme(
    'scene',
    '3D office and camera',
    /\b3d\b|scene|camera|floor|beanstalk|braid|crown|flower|garden|holo|beam|building|director|control-room|walkers|elevator|drone|workstation/,
  ),
  theme(
    'phone',
    'phone UI and design system',
    /phone|responsive|ios|touch|tablet|mobile|tab bar|service worker|manifest|installable|design system|stylesheet|layout|navigation|sidebar|top bar/,
  ),
  theme(
    'sessions',
    'session observation and hooks',
    /session|hook|transcript|observer|rollout|subagent|classif|department|orphan|zombie|process|clock out|worktree|telemetry|usage|context|panel/,
  ),
  theme(
    'orchestration',
    'control plane and runner',
    /schedule|skill|workflow|meeting|room|a2a|acp|integration|github|linear|reserv|review|machine|runner|backup|enroll|doctor|kernel|control|contracts|providers|mcp|dag|task|plan/,
  ),
  theme('quality', 'tests and tooling', (u) => /^(test|chore|ci|style|build)$/.test(u.type)),
];

const matches = (t, unit) =>
  typeof t.re === 'function'
    ? t.re(unit)
    : t.re.test(`${unit.scope} ${unit.subject}`.toLowerCase());

export function themeOf(unit, themes = THEMES) {
  return themes.find((t) => matches(t, unit)) ?? { id: 'other', label: 'maintenance' };
}

const SIZE_WEIGHT = 0.4;
const DAY_WEIGHT = 0.8;

/** Splits `items` (each `{theme, day}`) into `k` contiguous segments by dynamic programming. Deterministic. */
function segment(items, k) {
  const n = items.length;
  const parts = Math.max(1, Math.min(k, n));
  const ideal = n / parts;
  const cost = (i, j) => {
    const counts = new Map();
    const days = new Set();
    for (const item of items.slice(i, j)) {
      counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
      days.add(item.day);
    }
    const len = j - i;
    return (
      len -
      Math.max(...counts.values()) +
      DAY_WEIGHT * (days.size - 1) +
      (SIZE_WEIGHT * (len - ideal) ** 2) / ideal
    );
  };
  const best = Array.from({ length: parts + 1 }, () => new Array(n + 1).fill(Infinity));
  const from = Array.from({ length: parts + 1 }, () => new Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let m = 1; m <= parts; m++)
    for (let j = m; j <= n; j++)
      for (let i = m - 1; i < j; i++) {
        const value = best[m - 1][i] + cost(i, j);
        if (value < best[m][j]) {
          best[m][j] = value;
          from[m][j] = i;
        }
      }
  const bounds = [];
  for (let m = parts, j = n; m > 0; m--) {
    bounds.unshift([from[m][j], j]);
    j = from[m][j];
  }
  return bounds;
}

const TYPE_ORDER = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'chore',
  'ci',
  'build',
  'style',
  'revert',
];

function dominant(values, order) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) =>
      b[1] - a[1] ||
      (order ? order.indexOf(a[0]) - order.indexOf(b[0]) : 0) ||
      (a[0] < b[0] ? -1 : 1),
  )[0]?.[0];
}

/** The group's leading theme and, when it covers a quarter of the units, a second one. */
function rankThemes(found) {
  const counts = new Map();
  for (const t of found) counts.set(t.id, { t, n: (counts.get(t.id)?.n ?? 0) + 1 });
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n || (a.t.id < b.t.id ? -1 : 1));
  return ranked.filter((r, i) => i === 0 || (i === 1 && r.n * 4 >= found.length)).map((r) => r.t);
}

/**
 * Groups units (each `{pinned, type, scope, subject, day}`, oldest first) into about `target` milestones. Pinned
 * units are never merged with anything. Returns `[{pinned, indexes, themes, type}]` in order.
 */
export function groupUnits(units, { target = 24, themes = THEMES } = {}) {
  const regular = units.filter((u) => !u.pinned).length;
  const result = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const share = Math.max(1, Math.round((target * run.length) / Math.max(1, regular)));
    const items = run.map((i) => ({ theme: themeOf(units[i], themes).id, day: units[i].day }));
    for (const [from, to] of segment(items, share)) {
      const indexes = run.slice(from, to);
      const ranked = rankThemes(indexes.map((i) => themeOf(units[i], themes)));
      result.push({
        pinned: false,
        indexes,
        themes: ranked,
        type: dominant(
          indexes.map((i) => units[i].type),
          TYPE_ORDER,
        ),
      });
    }
    run = [];
  };
  units.forEach((unit, index) => {
    if (unit.pinned) {
      flush();
      result.push({ pinned: true, indexes: [index], themes: [], type: unit.type });
    } else run.push(index);
  });
  flush();
  return result;
}

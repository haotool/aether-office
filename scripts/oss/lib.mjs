// Shared helpers for the open-source release kit (scripts/oss). Pure functions are exported for tests; nothing here
// touches the network or writes to a repository except through the explicit helpers named in history-tools.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const SUBJECT_MAX = 72;
export const CLONE_MARKER = 'oss-throwaway-clone.json';
export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'docs',
  'test',
  'chore',
  'ci',
  'build',
  'style',
  'revert',
];
const PREFIX = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9,/._-]+\\))?!?: (?=\\S)`);

/** Runs git in `repo` and returns stdout as text. */
export function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

export function toplevel(dir) {
  try {
    return realpathSync(
      execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return null;
  }
}

export function commandExists(name) {
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Commit subjects

export function conventional(subject) {
  const m = PREFIX.exec(subject);
  return m
    ? {
        type: m[1],
        scope: m[2] ? m[2].slice(1, -1) : '',
        prefix: m[0],
        rest: subject.slice(m[0].length),
      }
    : null;
}

export function wrap(text, width = SUBJECT_MAX) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const STRONG_BOUNDARY = /; | — |: | \(/g;
const WEAK_BOUNDARY = /, /g;
const DANGLING =
  /\s+(?:a|an|the|and|or|of|to|in|on|at|by|for|so|with|that|its|their|from|per|as|is|are|but|into|than|previous)$/i;

/** Last clause boundary of `rest` at or after `min` and within `room` characters that keeps parentheses balanced. */
function lastBoundary(rest, pattern, min, room) {
  let cut = -1;
  for (const m of rest.matchAll(pattern)) {
    const head = rest.slice(0, m.index);
    const balanced = (head.match(/\(/g)?.length ?? 0) === (head.match(/\)/g)?.length ?? 0);
    if (m.index >= min && m.index <= room && balanced) cut = m.index;
  }
  return cut;
}

/**
 * Shortens a long subject to `max` characters at the last clause boundary (strong ones first) that keeps balanced
 * parentheses, keeping the conventional prefix. The caller puts the full original subject into the body.
 */
export function shortenSubject(subject, max = SUBJECT_MAX) {
  if (subject.length <= max) return subject;
  const prefix = conventional(subject)?.prefix ?? '';
  const rest = subject.slice(prefix.length);
  const room = max - prefix.length;
  let cut = lastBoundary(rest, STRONG_BOUNDARY, 10, room);
  if (cut < 0) cut = lastBoundary(rest, WEAK_BOUNDARY, 16, room);
  let head = cut > 0 ? rest.slice(0, cut) : rest.slice(0, room + 1);
  if (cut < 0)
    head = head.includes(' ') ? head.slice(0, head.lastIndexOf(' ')) : head.slice(0, room);
  head = head.replace(/[\s,;:(—-]+$/, '').replace(/\.$/, '');
  while (DANGLING.test(head)) head = head.replace(DANGLING, '');
  return prefix + head;
}

/** Subject for a "Merge branch ..." commit, derived from the subject of the merged tip. */
export function mergeSubject(mergedTipSubject) {
  const stripped = conventional(mergedTipSubject)?.rest ?? mergedTipSubject;
  return shortenSubject(`chore: merge ${stripped}`);
}

const TRAILER = /^(?:Co-Authored-By|Claude-Session|Generated-by):.*$/gim;

/** Removes attribution trailers (Co-Authored-By, session links) from a message. */
export function stripTrailers(message) {
  return `${message
    .replace(TRAILER, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '')}\n`;
}

/** New message: short subject, then the full original subject (when it changed), then the original body. */
export function rewriteMessage(newSubject, originalMessage) {
  const [first = '', ...others] = originalMessage.replace(/\s+$/, '').split('\n');
  const body = others.join('\n').replace(/^\n+/, '');
  const parts = [newSubject];
  if (first !== newSubject) parts.push(wrap(first));
  if (body) parts.push(body);
  return `${parts.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Pattern scanning

/** Directory owners that appear in fixtures and examples, not real people. */
export const PLACEHOLDER_USERS = new Set(
  'a b dev sam alice bob user username you me name example foo bar test tester runner ubuntu node app admin root shared public office someone joe jane john'.split(
    ' ',
  ),
);

const placeholderOnly = (name) => PLACEHOLDER_USERS.has(name.toLowerCase());

/** Built-in generic rules. `accept` rejects false positives; `docsOnly` limits a rule to documentation files. */
export const BUILT_IN_RULES = [
  {
    id: 'user-path',
    severity: 'fail',
    re: /\/Users\/([A-Za-z0-9._-]+)/g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute macOS home path',
  },
  {
    id: 'user-path',
    severity: 'fail',
    re: /[A-Za-z]:\\{1,4}Users\\{1,4}([A-Za-z0-9._-]+)/g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute Windows home path',
  },
  {
    id: 'user-path',
    severity: 'fail',
    re: /\/home\/([a-z_][a-z0-9_-]*)\//g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute Linux home path',
  },
  {
    id: 'hostname',
    severity: 'fail',
    re: /\b[A-Za-z0-9-]+['’]?s-(?:MacBook|iMac|Mac-mini|Mac-Studio|Mac-Pro)[A-Za-z0-9-]*/g,
    note: 'machine host name',
  },
  {
    id: 'hostname',
    severity: 'warn',
    re: /\b[a-z0-9-]+\.(?:local|lan|home\.arpa)\b(?![.\w-])/g,
    accept: (m) => !/^(?:localhost|example|host|my-?host|machine|computer|settings)\./i.test(m[0]),
    docsOnly: true,
    note: 'local network host name in documentation (confirm it is an example)',
  },
  {
    id: 'lan-address',
    severity: 'warn',
    re: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
    docsOnly: true,
    note: 'private network address in documentation',
  },
];

/** Built-in secret shapes, used when gitleaks is not installed. */
export const TOKEN_RULES = [
  { id: 'token', re: /\bAKIA[0-9A-Z]{16}\b/g, note: 'AWS access key id' },
  { id: 'token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, note: 'GitHub token' },
  { id: 'token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g, note: 'GitHub fine-grained token' },
  { id: 'token', re: /\bsk-[A-Za-z0-9_-]{32,}\b/g, note: 'API key (sk-)' },
  { id: 'token', re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, note: 'Slack token' },
  { id: 'token', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, note: 'Google API key' },
  {
    id: 'token',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    note: 'private key block',
  },
  {
    id: 'token',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    note: 'JWT',
  },
].map((r) => ({ ...r, severity: 'fail', token: true }));

const escapeRegex = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

/**
 * Parses `.oss-private-patterns`: one pattern per line, `#` comments. A pattern is a case-insensitive literal or
 * `re:<regex>`; an optional ` ==> replacement` gives what history cleanup writes instead (default `REDACTED`).
 */
export function parsePrivatePatterns(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern = '', replacement = 'REDACTED'] = line.split(/\s+==>\s+/).map((s) => s.trim());
    if (!pattern) continue;
    const source = pattern.startsWith('re:') ? pattern.slice(3) : escapeRegex(pattern);
    rules.push({
      id: `private-pattern#${rules.length + 1}`,
      severity: 'fail',
      re: new RegExp(source, 'gi'),
      source,
      replacement,
      private: true,
      note: 'maintainer-private string',
    });
  }
  return rules;
}

export function loadPrivatePatterns(file) {
  return file && existsSync(file) ? parsePrivatePatterns(readFileSync(file, 'utf8')) : [];
}

const REDACT = (text) => (text.length <= 8 ? '***' : `${text.slice(0, 4)}***`);

/** Returns `{rule, line, sample}` for every finding of `rules` in `text`. */
export function scanText(text, rules, { docs = false } = {}) {
  const findings = [];
  for (const rule of rules) {
    if (rule.docsOnly && !docs) continue;
    for (const m of text.matchAll(rule.re)) {
      if (rule.accept && !rule.accept(m)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      const sample = rule.private
        ? '(private pattern)'
        : rule.token
          ? REDACT(m[0])
          : m[0].slice(0, 60);
      findings.push({ rule: rule.id, severity: rule.severity, note: rule.note, line, sample });
    }
  }
  return findings;
}

/**
 * Text rewrite rules for history cleanup (Python regex syntax, applied to text blobs and commit messages by the
 * filter-repo callback): home directories become `/Users/dev`, private patterns become their replacement.
 */
export function replaceRules(privateRules) {
  const names = [...PLACEHOLDER_USERS].join('|');
  return [
    { re: String.raw`/Users/(?!(?:${names})\b)[A-Za-z0-9._-]+`, rep: '/Users/dev', literal: true },
    {
      re: String.raw`([A-Za-z]):(\\{1,4})Users\2(?!(?:${names})\b)[A-Za-z0-9._-]+`,
      rep: String.raw`\1:\2Users\2dev`,
      literal: false,
    },
    ...privateRules.map((r) => ({ re: `(?i:${r.source})`, rep: r.replacement, literal: true })),
  ];
}

const BINARY_EXTENSIONS =
  /\.(?:glb|gltf|png|jpe?g|webp|gif|ico|zip|gz|blend1?|woff2?|ttf|otf|wasm|sqlite|mp4|webm|mov|pdf|bin)$/i;
export const isBinaryPath = (file) => BINARY_EXTENSIONS.test(file);
export const isDocPath = (file) =>
  /\.(?:md|mdx|txt|ya?ml)$/i.test(file) || file.startsWith('docs/');
export const looksBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

/** Printable ASCII runs of a binary file, the way `strings` reads it (latin1 keeps byte offsets and costs no copies). */
export function binaryText(buffer) {
  return buffer.toString('latin1').replace(/[^\x20-\x7e\n]+/g, '\n');
}

// ---------------------------------------------------------------------------------------------------------------
// History reading

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

// ---------------------------------------------------------------------------------------------------------------
// Safety: only ever rewrite a clone this kit created

/** Resolves the git dir of a bare or normal clone. */
function gitDirOf(dir) {
  return existsSync(path.join(dir, 'HEAD')) && existsSync(path.join(dir, 'objects'))
    ? dir
    : path.join(dir, '.git');
}

/**
 * Refuses unless `dir` is a throwaway clone created by history-apply: marker present, not the current checkout or the
 * recorded source, not inside the checkout, and no remote `origin` that still points anywhere.
 */
export function assertThrowawayClone(dir, { cwd = process.cwd() } = {}) {
  if (!existsSync(dir)) throw new Error(`refusing: ${dir} does not exist`);
  const real = realpathSync(dir);
  const marker = path.join(gitDirOf(real), CLONE_MARKER);
  if (!existsSync(marker))
    throw new Error(
      `refusing: ${dir} is not a throwaway clone created by history-apply (no ${CLONE_MARKER})`,
    );
  const info = JSON.parse(readFileSync(marker, 'utf8'));
  const top = toplevel(cwd);
  const inside = (parent) => parent && (real === parent || real.startsWith(parent + path.sep));
  if (inside(top))
    throw new Error(`refusing: ${dir} is, or is inside, the current checkout ${top}`);
  if (info.source && existsSync(info.source) && realpathSync(info.source) === real)
    throw new Error(`refusing: ${dir} is the source repository`);
  const remotes = git(real, ['remote']).split('\n').filter(Boolean);
  if (remotes.includes('origin') && git(real, ['config', '--get', 'remote.origin.url']).trim())
    throw new Error(
      `refusing: ${dir} still has a remote origin; a throwaway clone must not point anywhere`,
    );
  return info;
}

/** Refuses an output directory that could be a real checkout: it must not exist (or be empty) and sit outside it. */
export function assertFreshOutput(out, source) {
  const resolved = path.resolve(out);
  if (existsSync(resolved)) {
    const entries = execFileSync('ls', ['-A', resolved], { encoding: 'utf8' }).trim();
    if (entries) throw new Error(`refusing: output ${out} exists and is not empty`);
  }
  const top = toplevel(source);
  const roots = [
    top,
    top && realpathSync(path.resolve(top, git(top, ['rev-parse', '--git-common-dir']).trim())),
  ];
  const parent = existsSync(resolved)
    ? realpathSync(resolved)
    : path.join(realpathSync(path.dirname(resolved)), path.basename(resolved));
  for (const root of roots)
    if (root && (parent === root || parent.startsWith(root + path.sep)))
      throw new Error(`refusing: output ${out} is inside the source repository ${root}`);
}

// ---------------------------------------------------------------------------------------------------------------
// What history cleanup removes

export const DEFAULT_STRIP = {
  // Removed from every commit. Root-anchored directories end in "/", globs match at any depth.
  paths: [
    'glob:*.blend',
    'glob:*.blend1',
    'evidence/',
    'test-results/',
    'playwright-report/',
    'glob:*.trace.zip',
  ],
  // Binary versions that are not part of the tip are dropped from history; the tip's versions always stay.
  blobExtensions: [
    'glb',
    'gltf',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'zip',
    'blend',
    'blend1',
    'mp4',
    'webm',
    'mov',
    'psd',
  ],
  minBytes: 200 * 1024,
  maxAnyBytes: 2 * 1024 * 1024,
};

/** Every blob reachable from `rev`: `{id, size, path}` (the first path git lists for it). */
export function historyBlobs(repo, rev) {
  const paths = new Map();
  for (const line of git(repo, ['rev-list', '--objects', rev]).split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) paths.set(line.slice(0, space), line.slice(space + 1));
    else if (line) paths.set(line, '');
  }
  const out = git(repo, ['cat-file', '--batch-check=%(objecttype) %(objectname) %(objectsize)'], {
    input: `${[...paths.keys()].join('\n')}\n`,
  });
  const blobs = [];
  for (const line of out.split('\n')) {
    const [type, id, size] = line.split(' ');
    if (type === 'blob' && id) blobs.push({ id, size: Number(size), path: paths.get(id) ?? '' });
  }
  return blobs;
}

export function tipBlobIds(repo, rev) {
  return new Set(
    git(repo, ['ls-tree', '-r', '-z', rev])
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split(/[ \t]/)[2]),
  );
}

/** Blobs of `rev` history that cleanup strips: heavy binaries (or any huge file) that the tip does not use. */
export function strippableBlobs(repo, rev, strip = DEFAULT_STRIP) {
  const keep = tipBlobIds(repo, rev);
  const extensions = new Set(strip.blobExtensions);
  return historyBlobs(repo, rev).filter((b) => {
    const ext = path.extname(b.path).slice(1).toLowerCase();
    return (
      !keep.has(b.id) &&
      ((extensions.has(ext) && b.size >= strip.minBytes) || b.size >= strip.maxAnyBytes)
    );
  });
}

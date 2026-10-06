#!/usr/bin/env node
// Publishing-readiness check: scans the current tree and, with --history, the whole history of HEAD for things that must
// not be published (personal paths, private strings, secrets, huge or path-embedding binaries, missing community files,
// license problems, broken documentation links, untidy commit messages). No network. Exit 1 on any failure.
//
//   node scripts/oss/readiness-check.mjs [--root <repo>] [--history] [--private-patterns <file>]
//        [--maintainer-email <e>]... [--max-history-mb 5] [--skip-gitleaks] [--gitleaks-config <file>] [--strict] [--json]
//
// Private strings (names, e-mail addresses, host names) live in the gitignored `.oss-private-patterns` (see
// `.oss-private-patterns.example`); only generic patterns are built in.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BUILT_IN_RULES,
  SUBJECT_MAX,
  TOKEN_RULES,
  binaryText,
  commandExists,
  conventional,
  git,
  historyBlobs,
  isBinaryPath,
  isDocPath,
  loadPrivatePatterns,
  looksBinary,
  readCommits,
  scanText,
  toplevel,
  upstreamSet,
} from './lib.mjs';

const MB = 1024 * 1024;
const KIT_GITLEAKS_CONFIG = fileURLToPath(new URL('../../.gitleaks.toml', import.meta.url));
const SELF = /^(?:scripts\/oss\/|tests\/aether\/oss-)/;
const DETAIL_LIMIT = 12;

const REQUIRED_FILES = [
  'LICENSE',
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/CODEOWNERS',
];
const RECOMMENDED_FILES = [
  'CHANGELOG.md',
  '.gitignore',
  '.editorconfig',
  '.gitattributes',
  '.github/dependabot.yml',
  'THIRD_PARTY_NOTICES.md',
];
const REQUIRED_IGNORES = [
  'node_modules',
  'dist',
  '.data',
  '.env',
  '*.blend1',
  'coverage',
  'test-results',
  '.oss-private-patterns',
];
const FORBIDDEN_TRACKED = [
  [/(^|\/)node_modules\//, 'dependencies'],
  [/(^|\/)dist\//, 'build output'],
  [/^\.data\//, 'runtime data directory'],
  [/(^|\/)\.env(\.(?!example$).*)?$/, 'environment file'],
  [/^\.(claude|cursor|codex|aider|superclaude)(\/|$)/, 'agent configuration or worktrees'],
  [/\.blend1?$/, "Blender file (embeds the builder's paths)"],
  [/(^|\/)\.DS_Store$/, 'macOS metadata'],
  [/^\.(tools|research)\//, 'local tooling'],
  [/\.(sqlite3?|db)(-wal|-shm)?$/, 'database file'],
  [/\.(pem|p12|pfx|key)$|(^|\/)id_(rsa|ed25519)$/, 'key material'],
  [/(^|\/)\.npmrc$/, 'npm configuration (may hold a token)'],
  [/\.log$/, 'log file'],
];
const PERMISSIVE =
  /^(MIT|MIT-0|ISC|BSD-2-Clause|BSD-3-Clause|0BSD|Apache-2\.0|Unlicense|CC0-1\.0|BlueOak-1\.0\.0|Zlib|Python-2\.0|CC-BY-4\.0|WTFPL)$/i;
const STRONG_COPYLEFT = /(^|[^L])GPL|AGPL|SSPL|EUPL|CC-BY-SA|OSL/i;
const WEAK_COPYLEFT = /LGPL|MPL|EPL|CDDL|CPL/i;

const results = [];
const add = (id, title, status, lines = []) => results.push({ id, title, status, lines });
const worst = (items, bad = 'fail') => (items.length ? bad : 'pass');

function listTracked(root) {
  return git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
}

function checkCommunityFiles(root, files) {
  const set = new Set(files);
  const templates = files.filter((f) => f.startsWith('.github/ISSUE_TEMPLATE/'));
  const missing = REQUIRED_FILES.filter((f) => !set.has(f));
  if (!templates.length) missing.push('.github/ISSUE_TEMPLATE/*');
  add(
    'community-files',
    'Community files present',
    worst(missing),
    missing.map((f) => `missing ${f}`),
  );
  const advice = RECOMMENDED_FILES.filter((f) => !set.has(f));
  add(
    'community-recommended',
    'Recommended files present',
    worst(advice, 'warn'),
    advice.map((f) => `missing ${f}`),
  );
}

function checkTrackedHygiene(root, files) {
  const hits = [];
  for (const file of files)
    for (const [re, why] of FORBIDDEN_TRACKED) if (re.test(file)) hits.push(`${file}: ${why}`);
  add(
    'tracked-artifacts',
    'No build output, local data, agent files or key material tracked',
    worst(hits),
    hits,
  );
  const ignore = existsSync(path.join(root, '.gitignore'))
    ? readFileSync(path.join(root, '.gitignore'), 'utf8')
    : '';
  const missing = REQUIRED_IGNORES.filter(
    (p) => !ignore.split('\n').some((l) => l.replace(/^\//, '').replace(/\/$/, '') === p),
  );
  add(
    'gitignore',
    '.gitignore covers build output, data, secrets and local files',
    worst(missing),
    missing.map((p) => `not ignored: ${p}`),
  );
  const status = git(root, ['status', '--porcelain', '--untracked-files=all'])
    .split('\n')
    .filter((l) => l.startsWith('?? '));
  add(
    'untracked',
    'No untracked, unignored files (run after `pnpm build` to prove .gitignore coverage)',
    worst(status, 'warn'),
    status.map((l) => l.slice(3)),
  );
  const data = path.join(root, '.data');
  if (existsSync(data)) {
    const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '.data/x']).status === 0;
    add('data-dir', 'Local .data (owner token, database) is ignored', ignored ? 'pass' : 'fail', [
      '.data exists; never publish or copy it',
    ]);
  }
}

function readFileSafe(file) {
  try {
    return statSync(file).size > 64 * MB ? null : readFileSync(file);
  } catch {
    return null;
  }
}

function checkTreeContent(root, files, rules, hasGitleaks) {
  const text = [...BUILT_IN_RULES, ...rules, ...(hasGitleaks ? [] : TOKEN_RULES)];
  const binaryRules = text.filter((r) => r.id === 'user-path' || r.private);
  const textHits = [];
  const binaryHits = [];
  for (const file of files) {
    if (SELF.test(file)) continue;
    const buffer = readFileSafe(path.join(root, file));
    if (!buffer) continue;
    const binary = isBinaryPath(file) || looksBinary(buffer);
    const findings = binary
      ? scanText(binaryText(buffer), binaryRules)
      : scanText(buffer.toString('utf8'), text, { docs: isDocPath(file) });
    for (const f of findings) (binary ? binaryHits : textHits).push({ file, ...f });
  }
  report(
    'tree-content',
    'Tree: personal paths, private strings, host names, LAN addresses, tokens',
    textHits,
  );
  report(
    'tree-binary',
    'Tree: binary files embed no personal paths or private strings',
    binaryHits,
  );
}

/** Groups findings per severity into one check result. */
function report(id, title, hits) {
  const fails = hits.filter((h) => h.severity === 'fail');
  const lines = hits
    .slice(0, 400)
    .map(
      (h) =>
        `${h.severity}: ${h.file}${h.line ? `:${h.line}` : ''} ${h.rule} ${h.note ?? ''} ${h.sample}`,
    );
  add(id, title, fails.length ? 'fail' : hits.length ? 'warn' : 'pass', lines);
}

function runGitleaks(root, mode, config) {
  const args = [
    mode === 'history' ? 'git' : 'dir',
    root,
    '--no-banner',
    '--redact',
    '--exit-code',
    '2',
    '--log-level',
    'error',
  ];
  if (config) args.push('--config', config);
  const run = spawnSync('gitleaks', args, { encoding: 'utf8' });
  if (run.status === 0) return [];
  if (run.status === 2) {
    const m = /leaks found: (\d+)/.exec(`${run.stdout}${run.stderr}`);
    return [
      `gitleaks reported ${m ? m[1] : 'some'} finding(s); rerun \`gitleaks ${args.slice(0, 2).join(' ')} --redact\` to review`,
    ];
  }
  return [`gitleaks failed: ${(run.stderr || run.stdout).split('\n')[0]}`];
}

function checkSecrets(root, history, skip, configOption) {
  if (skip || !commandExists('gitleaks')) {
    add('gitleaks', 'Secret scan with gitleaks', 'skip', [
      skip
        ? 'skipped by flag'
        : 'gitleaks not installed; built-in token patterns were used instead',
    ]);
    return false;
  }
  const config =
    [configOption, path.join(root, '.gitleaks.toml'), KIT_GITLEAKS_CONFIG].find(
      (f) => f && existsSync(f),
    ) ?? null;
  const lines = runGitleaks(root, 'tree', config);
  add('gitleaks-tree', 'gitleaks: current tree is clean', worst(lines), lines);
  if (history) {
    const found = runGitleaks(root, 'history', config);
    add('gitleaks-history', 'gitleaks: history is clean', worst(found), found);
  }
  return true;
}

function largeTracked(root, files, limitMb) {
  const rows = files
    .map((f) => ({ f, size: readFileSafe(path.join(root, f))?.length ?? 0 }))
    .filter((r) => r.size > limitMb * MB)
    .sort((a, b) => b.size - a.size);
  add(
    'large-tree',
    `Tracked files over ${limitMb} MB (shipped assets are expected here)`,
    worst(rows, 'warn'),
    rows.slice(0, 15).map((r) => `${(r.size / MB).toFixed(2).padStart(6)} MB  ${r.f}`),
  );
}

const licenseOf = (pkg) => {
  const raw = pkg.license ?? pkg.licenses;
  if (Array.isArray(raw)) return raw.map((l) => l.type ?? l).join(' OR ');
  return typeof raw === 'object' && raw ? (raw.type ?? 'UNKNOWN') : (raw ?? 'UNKNOWN');
};

function lockfilePackages(root) {
  const file = path.join(root, 'pnpm-lock.yaml');
  if (!existsSync(file)) return [];
  const out = new Set();
  let inPackages = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\S/.test(line)) inPackages = line.startsWith('packages:');
    const m = inPackages && /^ {2}'?(@?[^@\s']+)@([^'\s:(]+)'?:\s*$/.exec(line);
    if (m) out.add(`${m[1]}@${m[2]}`);
  }
  return [...out].sort();
}

/** Reads the license text next to a package that declares no `license` field. */
function sniffLicenseFile(dir) {
  const file = readdirSync(dir).find((f) => /^licen[sc]e(\.(md|txt))?$/i.test(f));
  const text = file ? readFileSync(path.join(dir, file), 'utf8').slice(0, 3000) : '';
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Apache License/i.test(text)) return 'Apache-2.0';
  if (/Redistribution and use in source and binary forms/i.test(text))
    return /Neither the name/i.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  return 'UNKNOWN';
}

function installedLicense(store, name, version) {
  const dir = store.get(`${name.replace('/', '+')}@${version}`);
  const base = dir && path.join(dir, 'node_modules', name);
  const file = base && path.join(base, 'package.json');
  if (!file || !existsSync(file)) return null;
  const declared = licenseOf(JSON.parse(readFileSync(file, 'utf8')));
  return declared === 'UNKNOWN' ? sniffLicenseFile(base) : declared;
}

function checkLicenses(root, files) {
  const lines = [];
  if (!files.includes('package.json')) {
    add('license-project', 'Project license is consistent (LICENSE, package.json files)', 'fail', [
      'package.json is not tracked',
    ]);
    return;
  }
  const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const license = existsSync(path.join(root, 'LICENSE'))
    ? readFileSync(path.join(root, 'LICENSE'), 'utf8')
    : '';
  if (
    rootPkg.license &&
    !new RegExp(rootPkg.license.replace(/-.*/, ''), 'i').test(license.slice(0, 200))
  )
    lines.push(`LICENSE does not start like ${rootPkg.license}`);
  for (const f of files.filter((x) => /^(apps|packages|tools)\/[^/]+\/package\.json$/.test(x))) {
    const pkg = JSON.parse(readFileSync(path.join(root, f), 'utf8'));
    if (pkg.license && pkg.license !== rootPkg.license)
      lines.push(`${f}: license ${pkg.license} differs from the root ${rootPkg.license}`);
  }
  add(
    'license-project',
    'Project license is consistent (LICENSE, package.json files)',
    worst(lines),
    lines,
  );

  const store = path.join(root, 'node_modules', '.pnpm');
  const packages = lockfilePackages(root);
  if (!existsSync(store) || !packages.length) {
    add('license-deps', 'Dependency licenses', 'skip', [
      'run `pnpm install` first (reads node_modules/.pnpm and pnpm-lock.yaml)',
    ]);
    return;
  }
  const index = new Map(
    readdirSync(store).map((entry) => [entry.replace(/_.*$/, ''), path.join(store, entry)]),
  );
  const notices = existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md'))
    ? readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
    : '';
  const problems = [];
  const reported = new Set();
  const counts = new Map();
  for (const entry of packages) {
    const at = entry.lastIndexOf('@');
    const [name, version] = [entry.slice(0, at), entry.slice(at + 1)];
    const found = installedLicense(index, name, version);
    if (!found) continue; // optional or other-platform package that is not installed
    counts.set(found, (counts.get(found) ?? 0) + 1);
    const options = found.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/);
    if (options.some((o) => PERMISSIVE.test(o.trim()))) continue;
    const noted =
      notices.includes(name) ||
      notices.includes(name.replace(/-(darwin|linux|win32|freebsd|android)-.*$/, ''));
    if (reported.has(name)) continue;
    reported.add(name);
    if (options.every((o) => STRONG_COPYLEFT.test(o))) problems.push(`fail: ${entry} is ${found}`);
    else if (!noted)
      problems.push(`warn: ${entry} is ${found} and is not named in THIRD_PARTY_NOTICES.md`);
  }
  const summary = `${packages.length} locked packages; ${[...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([l, n]) => `${l} ${n}`)
    .join(', ')}`;
  const failing = problems.some((p) => p.startsWith('fail'));
  add(
    'license-deps',
    'Dependency licenses are permissive or documented',
    failing ? 'fail' : problems.length ? 'warn' : 'pass',
    [summary, ...problems],
  );
}

const slug = (heading) =>
  heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

function anchorsOf(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(m[1].replace(/[`*_]/g, ''));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n ? `${base}-${n}` : base);
  }
  return anchors;
}

function checkDocLinks(root, files) {
  const tracked = new Set(files);
  const dirs = new Set(
    files.flatMap((f) =>
      f
        .split('/')
        .slice(0, -1)
        .map((_, i, parts) => parts.slice(0, i + 1).join('/')),
    ),
  );
  const broken = [];
  const anchorCache = new Map();
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(path.join(root, file), 'utf8')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
      const [rawPath = '', anchor] = target.split('#');
      const resolved = rawPath
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(rawPath)))
        : file;
      const clean = resolved.replace(/\/$/, '');
      if (!tracked.has(clean) && !dirs.has(clean)) {
        broken.push(`${file}: missing target ${target}`);
        continue;
      }
      if (anchor && tracked.has(clean) && clean.endsWith('.md')) {
        if (!anchorCache.has(clean))
          anchorCache.set(clean, anchorsOf(readFileSync(path.join(root, clean), 'utf8')));
        if (!anchorCache.get(clean).has(decodeURIComponent(anchor).toLowerCase()))
          broken.push(`${file}: missing anchor ${target}`);
      }
    }
  }
  const files404 = broken.filter((b) => b.includes('missing target'));
  add(
    'doc-links',
    'Documentation links resolve',
    files404.length ? 'fail' : broken.length ? 'warn' : 'pass',
    broken,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// History

async function streamBlobs(repo, ids, onBlob) {
  const child = spawn('git', ['-C', repo, 'cat-file', '--batch'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  child.stdin.end(`${ids.join('\n')}\n`);
  let chunks = [];
  let length = 0;
  let pending = null;
  const take = (n) => {
    const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    chunks = n < all.length ? [all.subarray(n)] : [];
    length = all.length - n;
    return all.subarray(0, n);
  };
  for await (const chunk of child.stdout) {
    chunks.push(chunk);
    length += chunk.length;
    for (;;) {
      if (!pending) {
        const head =
          chunks.length > 1 && chunks[0].indexOf(10) < 0 ? Buffer.concat(chunks) : chunks[0];
        const nl = head?.indexOf(10) ?? -1;
        if (nl < 0) break;
        if (head !== chunks[0]) chunks = [head];
        const [id = '', , size = '0'] = take(nl + 1)
          .toString()
          .trim()
          .split(' ');
        pending = { id, size: Number(size) };
      }
      if (length < pending.size + 1) break;
      onBlob(pending.id, take(pending.size + 1).subarray(0, pending.size));
      pending = null;
    }
  }
}

async function checkHistoryContent(root, rules, maxMb, hasGitleaks) {
  const blobs = historyBlobs(root, 'HEAD');
  const ids = blobs.filter((b) => b.size <= 64 * MB).map((b) => b.id);
  const byId = new Map(blobs.map((b) => [b.id, b]));
  const textRules = [
    ...BUILT_IN_RULES.filter((r) => !r.docsOnly),
    ...rules,
    ...(hasGitleaks ? [] : TOKEN_RULES),
  ];
  const binaryRules = textRules.filter((r) => r.id === 'user-path' || r.private);
  const hits = new Map();
  await streamBlobs(root, ids, (id, buffer) => {
    const { path: file = '' } = byId.get(id) ?? {};
    if (SELF.test(file)) return;
    const binary = isBinaryPath(file) || looksBinary(buffer);
    const findings = scanText(
      binary ? binaryText(buffer) : buffer.toString('utf8'),
      binary ? binaryRules : textRules,
    );
    for (const f of findings) {
      const key = `${binary ? 'binary' : 'text'} ${f.severity} ${file} ${f.rule}`;
      const entry = hits.get(key) ?? { ...f, file, binary, blobs: 0 };
      entry.blobs += 1;
      hits.set(key, entry);
    }
  });
  const rows = [...hits.values()];
  const fmt = (h) => ({
    ...h,
    line: 0,
    sample: `${h.sample} (${h.blobs} version${h.blobs === 1 ? '' : 's'})`,
  });
  report(
    'history-content',
    'History: personal paths, private strings, tokens in text files',
    rows.filter((h) => !h.binary).map(fmt),
  );
  report(
    'history-binary',
    'History: binary files embed no personal paths or private strings',
    rows.filter((h) => h.binary).map(fmt),
  );
  const large = blobs.filter((b) => b.size > maxMb * MB).sort((a, b) => b.size - a.size);
  const bytes = large.reduce((n, b) => n + b.size, 0);
  add(
    'large-history',
    `Blobs over ${maxMb} MB anywhere in history`,
    worst(large),
    large.length
      ? [
          `${large.length} blobs, ${(bytes / MB).toFixed(0)} MB in total; largest:`,
          ...large
            .slice(0, 10)
            .map(
              (b) => `${(b.size / MB).toFixed(2).padStart(6)} MB  ${b.id.slice(0, 10)}  ${b.path}`,
            ),
        ]
      : [],
  );
  const pack = /size-pack: (.+)/.exec(git(root, ['count-objects', '-vH']))?.[1] ?? '?';
  add('history-size', 'Repository pack size', 'pass', [
    `size-pack ${pack} (run \`git gc --aggressive\` for a fair figure)`,
  ]);
}

function checkHistoryPaths(root) {
  const seen = new Set(
    git(root, ['log', '--format=', '--name-only', 'HEAD']).split('\n').filter(Boolean),
  );
  const hits = [];
  for (const file of seen)
    for (const [re, why] of FORBIDDEN_TRACKED)
      if (re.test(file) && !/\.blend1?$/.test(file)) hits.push(`${file}: ${why}`);
  const blend = [...seen].filter((f) => /\.blend1?$/.test(f));
  if (blend.length) hits.push(`${blend.length} Blender file path(s) in history, e.g. ${blend[0]}`);
  add(
    'history-paths',
    'History: no local data, agent files, key material or Blender files ever committed',
    worst(hits),
    hits.slice(0, 40),
  );
}

function checkCommits(root, maintainerEmails, rules) {
  const commits = readCommits(root, 'HEAD');
  const emails = maintainerEmails.length ? maintainerEmails : [commits[0]?.author.email ?? ''];
  const upstream = upstreamSet(commits, emails);
  const own = commits.filter((c) => !upstream.has(c.hash));
  const long = own.filter((c) => c.subject.length > SUBJECT_MAX);
  const untyped = own.filter((c) => !conventional(c.subject));
  const trailers = own.filter((c) =>
    /^(Co-Authored-By|Signed-off-by|Claude-Session|Generated-by|Reviewed-by):/im.test(c.message),
  );
  const merges = own.filter((c) => c.parents.length > 1);
  const sample = (list) =>
    list.slice(0, 5).map((c) => `${c.hash.slice(0, 8)} ${c.subject.slice(0, 80)}`);
  add(
    'commit-length',
    `Maintainer commit subjects are at most ${SUBJECT_MAX} characters (${own.length} checked, ${upstream.size} upstream skipped)`,
    worst(long, 'warn'),
    [
      long.length
        ? `${long.length} too long, longest ${Math.max(...long.map((c) => c.subject.length))}`
        : '',
      ...sample(long),
    ].filter(Boolean),
  );
  add(
    'commit-type',
    'Maintainer commit subjects start with a conventional type',
    worst(untyped, 'warn'),
    [
      untyped.length ? `${untyped.length} without a type (${merges.length} merge commits)` : '',
      ...sample(untyped),
    ].filter(Boolean),
  );
  add(
    'commit-trailers',
    'No attribution trailers (Co-Authored-By, Signed-off-by, session links) in maintainer commits',
    worst(trailers, 'warn'),
    sample(trailers),
  );
  const authors = new Map();
  for (const c of commits) {
    const key = `${c.author.name} <${c.author.email}>`;
    authors.set(key, (authors.get(key) ?? 0) + 1);
  }
  add(
    'authors',
    `Authors (${authors.size}); check that each address is meant to be public`,
    'pass',
    [...authors].sort((a, b) => b[1] - a[1]).map(([who, n]) => `${String(n).padStart(4)}  ${who}`),
  );
  const identity = commits
    .flatMap((c) => [
      `${c.author.name} ${c.author.email}`,
      `${c.committer.name} ${c.committer.email}`,
      c.message,
    ])
    .join('\n');
  const privateHits = scanText(
    identity,
    rules.filter((r) => r.private),
  );
  add(
    'history-identity',
    'Commit authors and messages contain no private patterns',
    worst(privateHits),
    privateHits.slice(0, 10).map((h) => `${h.rule} (line ${h.line})`),
  );
}

function checkAgentArtifactsInTree(files) {
  const hits = files.filter((f) =>
    /^(\.claude|\.cursor|\.codex)\/|(^|\/)CLAUDE\.local\.md$|(^|\/)\.superclaude/.test(f),
  );
  add(
    'agent-artifacts',
    'No agent worktrees or local agent settings tracked',
    worst(hits),
    hits.slice(0, 20),
  );
}

// ---------------------------------------------------------------------------------------------------------------

const ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

function print(json) {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    console.log(`[${ICON[r.status]}] ${r.title}`);
    for (const line of r.lines.slice(0, DETAIL_LIMIT)) console.log(`       ${line}`);
    if (r.lines.length > DETAIL_LIMIT)
      console.log(`       ... ${r.lines.length - DETAIL_LIMIT} more (use --json for all)`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${count('pass')} passed, ${count('warn')} warnings, ${count('fail')} failed, ${count('skip')} skipped`,
  );
}

export async function run(options) {
  results.length = 0;
  const root = toplevel(options.root);
  if (!root) throw new Error(`${options.root} is not a git repository`);
  const privateFile = options.privatePatterns ?? path.join(root, '.oss-private-patterns');
  const rules = loadPrivatePatterns(privateFile);
  add('private-patterns', 'Private patterns file', rules.length ? 'pass' : 'warn', [
    rules.length
      ? `${rules.length} private pattern(s) loaded`
      : `no patterns: create ${path.basename(privateFile)} (see .oss-private-patterns.example) so names, e-mails and host names are checked`,
  ]);
  const files = listTracked(root);
  checkCommunityFiles(root, files);
  checkTrackedHygiene(root, files);
  checkAgentArtifactsInTree(files);
  const hasGitleaks = checkSecrets(
    root,
    options.history,
    options.skipGitleaks,
    options.gitleaksConfig,
  );
  checkTreeContent(root, files, rules, hasGitleaks);
  largeTracked(root, files, 1);
  checkLicenses(root, files);
  checkDocLinks(root, files);
  if (options.history) {
    await checkHistoryContent(root, rules, options.maxHistoryMb, hasGitleaks);
    checkHistoryPaths(root);
    checkCommits(root, options.maintainerEmails, rules);
  }
  return results;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      root: { type: 'string', default: '.' },
      history: { type: 'boolean', default: false },
      'private-patterns': { type: 'string' },
      'maintainer-email': { type: 'string', multiple: true },
      'max-history-mb': { type: 'string', default: '5' },
      'skip-gitleaks': { type: 'boolean', default: false },
      'gitleaks-config': { type: 'string' },
      strict: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  await run({
    root: values.root,
    history: values.history,
    privatePatterns: values['private-patterns'],
    maintainerEmails: values['maintainer-email'] ?? [],
    maxHistoryMb: Number(values['max-history-mb']),
    skipGitleaks: values['skip-gitleaks'],
    gitleaksConfig: values['gitleaks-config'],
  });
  print(values.json);
  const failed = results.some((r) => r.status === 'fail' || (values.strict && r.status === 'warn'));
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  BUILT_IN_RULES,
  TOKEN_RULES,
  binaryText,
  commandExists,
  git,
  isBinaryPath,
  isDocPath,
  looksBinary,
  scanText,
} from './lib.mjs';
import {
  FORBIDDEN_TRACKED,
  KIT_GITLEAKS_CONFIG,
  MB,
  RECOMMENDED_FILES,
  REQUIRED_FILES,
  REQUIRED_IGNORES,
  SELF,
} from './readiness-config.mjs';
import { add, worst } from './readiness-results.mjs';

export function listTracked(root) {
  return git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
}

export function checkCommunityFiles(root, files) {
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

export function checkTrackedHygiene(root, files) {
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

export function checkTreeContent(root, files, rules, hasGitleaks) {
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

export function report(id, title, hits) {
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

export function checkSecrets(root, history, skip, configOption) {
  if (skip || !commandExists('gitleaks')) {
    add('gitleaks', 'Secret scan with gitleaks', 'skip', [
      skip
        ? 'skipped by flag'
        : 'gitleaks not installed; built-in token patterns were used instead',
    ]);
    return false;
  }
  const config =
    [configOption, path.join(root, '.github', 'gitleaks.toml'), KIT_GITLEAKS_CONFIG].find(
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

const SHIPPED_ASSETS = /^apps\/web\/public\/assets\//;
const SHIPPED_BUDGET_MB = 40;

export function largeTracked(root, files, limitMb) {
  const sized = files.map((f) => ({ f, size: readFileSafe(path.join(root, f))?.length ?? 0 }));
  const shippedMb =
    sized.filter((r) => SHIPPED_ASSETS.test(r.f)).reduce((sum, r) => sum + r.size, 0) / MB;
  const rows = sized
    .filter((r) => r.size > limitMb * MB && !SHIPPED_ASSETS.test(r.f))
    .sort((a, b) => b.size - a.size);
  const lines = rows.slice(0, 15).map((r) => `${(r.size / MB).toFixed(2).padStart(6)} MB  ${r.f}`);
  if (shippedMb > SHIPPED_BUDGET_MB)
    lines.push(
      `${shippedMb.toFixed(1)} MB of shipped assets, over the ${SHIPPED_BUDGET_MB} MB budget`,
    );
  add(
    'large-tree',
    `Tracked files over ${limitMb} MB outside the shipped assets (${shippedMb.toFixed(1)} of ${SHIPPED_BUDGET_MB} MB)`,
    worst(lines, 'warn'),
    lines,
  );
}

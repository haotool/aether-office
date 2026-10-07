// Licence and documentation-link checks of the publishing-readiness check.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PERMISSIVE, STRONG_COPYLEFT } from './readiness-config.mjs';
import { add, worst } from './readiness-results.mjs';

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

export function checkLicenses(root, files) {
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

export function checkDocLinks(root, files) {
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

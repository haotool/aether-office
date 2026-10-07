// Everything known about each locked package, and the policy problems it raises (scripts/oss/third-party-notices.mjs).
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { APPROVED, EXCEPTIONS, FAMILY_DECLARED, PLATFORM_FAMILIES } from './notices-policy.mjs';
import { parseLockfile, shippedClosure, splitKey } from './notices-lockfile.mjs';
import { copyrightLines, declaredLicense, evaluate, sniffLicenses } from './notices-licences.mjs';

// -------------------------------------------------------------------------------------------------------- the packages

const LICENSE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;

/** name@version -> package directory, for every real (non-symlinked) package under node_modules/.pnpm. */
export function installedPackages(store) {
  const map = new Map();
  if (!existsSync(store)) return map;
  for (const entry of readdirSync(store)) {
    const modules = path.join(store, entry, 'node_modules');
    if (!existsSync(modules)) continue;
    for (const top of readdirSync(modules)) {
      const dirs = top.startsWith('@')
        ? readdirSync(path.join(modules, top)).map((n) => path.join(modules, top, n))
        : [path.join(modules, top)];
      for (const dir of dirs) {
        if (lstatSync(dir).isSymbolicLink() || !existsSync(path.join(dir, 'package.json')))
          continue;
        const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
        map.set(`${manifest.name}@${manifest.version}`, dir);
      }
    }
  }
  return map;
}

const authorOf = (manifest) =>
  typeof manifest.author === 'string' ? manifest.author : (manifest.author?.name ?? null);

/** Everything known about one locked package; `dir` is null when it is not installed on this machine. */
export function describePackage({ name, version, dir, platform, integrity }) {
  const family = platform ? PLATFORM_FAMILIES.find(([re]) => re.test(name)) : null;
  const pkg = {
    name,
    version,
    integrity,
    platform: Boolean(platform),
    problems: [],
    licenseTexts: [],
    notices: [],
  };
  let manifest = null;
  if (dir) {
    manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const file of readdirSync(dir).sort()) {
      if (!lstatSync(path.join(dir, file)).isFile()) continue;
      if (LICENSE_FILE.test(file))
        pkg.licenseTexts.push({ file, text: readFileSync(path.join(dir, file), 'utf8') });
      else if (NOTICE_FILE.test(file))
        pkg.notices.push({ file, text: readFileSync(path.join(dir, file), 'utf8') });
    }
  }
  const declared = manifest ? declaredLicense(manifest) : null;
  pkg.declared = declared;
  pkg.author = manifest ? authorOf(manifest) : null;
  pkg.homepage = manifest?.homepage ?? null;
  const exception = EXCEPTIONS[name];
  if (family) {
    pkg.license = family[2];
    pkg.source = `recorded for the ${family[1]} platform builds`;
    const expected = FAMILY_DECLARED[family[2]] ?? family[2];
    if (manifest && declared !== expected)
      pkg.problems.push(`declares "${declared}", recorded "${expected}" for its platform family`);
    // Platform builds are compared, not reproduced: their text is the same as the family's and may be absent here.
    pkg.licenseTexts = [];
    pkg.notices = [];
  } else if (exception) {
    pkg.license = exception.license;
    pkg.source = `recorded decision: ${exception.note}`;
    if (manifest && declared !== exception.declared)
      pkg.problems.push(
        `declares "${declared}" but the recorded decision is for "${exception.declared}"`,
      );
  } else if (!manifest) {
    pkg.license = 'UNKNOWN';
    pkg.source = 'not installed';
    pkg.problems.push('not installed: run pnpm install --frozen-lockfile');
  } else {
    pkg.license = declared ?? 'UNKNOWN';
    pkg.source = 'package.json license field';
  }
  const { chosen, status } = evaluate(pkg.license);
  pkg.chosen = chosen;
  pkg.status = status;
  const main = pkg.licenseTexts[0];
  const found = main ? sniffLicenses(main.text) : [];
  pkg.fileLicense = found.length ? found.join(' + ') : null;
  if (!family && found.length && !exception) {
    const ids = pkg.license.match(/[A-Za-z0-9.+-]+/g) ?? [];
    if (!found.some((id) => ids.includes(id)))
      pkg.problems.push(
        `${main.file} reads as ${pkg.fileLicense} but package.json says ${pkg.license}`,
      );
  }
  pkg.copyright = [...new Set(pkg.licenseTexts.flatMap((t) => copyrightLines(t.text)))];
  return pkg;
}

/** Reads the lockfile and node_modules and classifies every package. */
export function collect(root) {
  const lock = parseLockfile(readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'));
  const installed = installedPackages(path.join(root, 'node_modules', '.pnpm'));
  const shipped = shippedClosure(lock);
  const ids = new Set(Object.keys(lock.snapshots).map((k) => splitKey(k).id));
  for (const key of Object.keys(lock.packages)) ids.add(splitKey(key).id);
  const all = [...ids].sort().map((id) => {
    const { name, version } = splitKey(id);
    const meta = lock.packages[id] ?? {};
    const pkg = describePackage({ name, version, dir: installed.get(id) ?? null, ...meta });
    const scopes = shipped.get(id);
    pkg.scope = scopes ? [...scopes].sort().join('+') : 'dev';
    return pkg;
  });
  return all;
}

/** Problems that fail the check. */
export function policyProblems(packages) {
  const out = [];
  for (const p of packages) {
    // A build for another platform is not installed here; its licence is the recorded family one.
    const problems = p.problems.filter((x) => !(p.platform && x.startsWith('not installed')));
    for (const problem of problems) out.push(`${p.name}@${p.version}: ${problem}`);
    if (p.status === 'denied')
      out.push(`${p.name}@${p.version}: ${p.chosen} is denied by the licence policy`);
    else if (p.status === 'unknown')
      out.push(`${p.name}@${p.version}: licence "${p.license}" is unknown or not approved`);
    else if (
      p.status === 'conditional' &&
      p.scope !== 'dev' &&
      !APPROVED[p.name] &&
      !EXCEPTIONS[p.name]?.approved &&
      !p.platform
    )
      out.push(
        `${p.name}@${p.version}: ${p.chosen} is shipped (${p.scope}) and needs an entry in APPROVED`,
      );
  }
  return out;
}

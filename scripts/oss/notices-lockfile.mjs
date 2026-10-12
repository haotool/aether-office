import path from 'node:path';
import { BUILD_ONLY, ROOTS } from './notices-policy.mjs';

const unquote = (s) =>
  s
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .replace(/^"(.*)"$/, '$1');

export function parseLockfile(text) {
  const docs = text.split(/^---\s*$/m).filter((d) => /^importers:/m.test(d));
  const doc = docs.at(-1) ?? '';
  const importers = {};
  const packages = {};
  const snapshots = {};
  let section = null;
  let entry = null;
  let group = null;
  let dep = null;
  for (const line of doc.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      section = line.replace(/:.*$/, '');
      entry = null;
      continue;
    }
    if (indent === 2 && /:\s*(\{\})?\s*$/.test(line)) {
      const key = unquote(line.replace(/:\s*(\{\})?\s*$/, ''));
      if (section === 'importers') entry = importers[key] = {};
      else if (section === 'packages') entry = packages[key] = {};
      else if (section === 'snapshots') entry = snapshots[key] = {};
      else entry = null;
      group = null;
      continue;
    }
    if (!entry) continue;
    const m = /^(\s+)('[^']*'|[^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = unquote(m[2]);
    const value = m[3].trim();
    if (indent === 4) {
      group = null;
      if (section === 'packages' && key === 'resolution') {
        const integrity = /integrity:\s*([^,}\s]+)/.exec(value);
        if (integrity) entry.integrity = integrity[1];
      } else if (section === 'packages' && (key === 'os' || key === 'cpu' || key === 'libc')) {
        entry.platform = true;
      } else if (/^(dependencies|devDependencies|optionalDependencies)$/.test(key) && !value) {
        group = entry[key] = {};
      }
    } else if (group && indent === 6) {
      if (section === 'importers') {
        dep = key;
        group[dep] = null;
      } else {
        group[key] = unquote(value);
      }
    } else if (group && indent === 8 && section === 'importers' && key === 'version') {
      group[dep] = unquote(value);
    }
  }
  return { importers, packages, snapshots };
}

export function splitKey(key) {
  const base = key.replace(/\(.*$/, '');
  const at = base.lastIndexOf('@');
  return { name: base.slice(0, at), version: base.slice(at + 1), id: base };
}

export function shippedClosure(lock, roots = ROOTS, buildOnly = BUILD_ONLY) {
  const scopes = new Map();
  const visit = (key, scope) => {
    const { id, name } = splitKey(key);
    if (name.startsWith('@types/')) return;

    const seen = scopes.get(id) ?? new Set();
    if (seen.has(scope) && scopes.has(id)) return;
    seen.add(scope);
    scopes.set(id, seen);
    const snap = lock.snapshots[key] ?? lock.snapshots[id] ?? {};
    for (const deps of [snap.dependencies, snap.optionalDependencies])
      for (const [name, version] of Object.entries(deps ?? {}))
        if (!version.startsWith('link:')) visit(`${name}@${version}`, scope);
  };
  const visitImporter = (importerPath, scope, done) => {
    if (done.has(importerPath)) return;
    done.add(importerPath);
    const importer = lock.importers[importerPath] ?? {};
    for (const deps of [importer.dependencies, importer.optionalDependencies])
      for (const [name, version] of Object.entries(deps ?? {})) {
        if (!version) continue;
        if (version.startsWith('link:')) {
          visitImporter(
            path.posix.normalize(path.posix.join(importerPath, version.slice(5))),
            scope,
            done,
          );
        } else if (!(importerPath === 'apps/web' && buildOnly.has(name))) {
          visit(`${name}@${version}`, scope);
        }
      }
  };
  for (const [importerPath, scope] of Object.entries(roots))
    visitImporter(importerPath, scope, new Set());
  return scopes;
}

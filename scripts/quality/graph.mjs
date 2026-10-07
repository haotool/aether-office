// The import graph over the parsed files: cycles, fan-in, unused exports and what the unit tests reach.
import path from 'node:path';

const EXTENSION = /\.(m?js|jsx)$/;
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

/** Workspace package name -> { subpath: repo file }, from each package.json "exports". */
export function workspacePackages(repo) {
  const found = new Map();
  for (const file of repo.files.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f))) {
    let manifest;
    try {
      manifest = JSON.parse(repo.read(file));
    } catch {
      continue;
    }
    if (!manifest.name) continue;
    const dir = path.posix.dirname(file);
    const exports =
      typeof manifest.exports === 'string' ? { '.': manifest.exports } : (manifest.exports ?? {});
    const entries = Object.entries(exports).filter(([, target]) => typeof target === 'string');
    found.set(
      manifest.name,
      Object.fromEntries(entries.map(([sub, target]) => [sub, path.posix.join(dir, target)])),
    );
  }
  return found;
}

/** Returns a function mapping (importing file, specifier) to a repo file, or null for external packages. */
export function makeResolver(repo) {
  const known = new Set(repo.files);
  const packages = workspacePackages(repo);
  const tryFile = (base) => {
    if (known.has(base)) return base;
    const stem = base.replace(EXTENSION, '');
    for (const ext of ['', ...EXTENSIONS]) if (known.has(stem + ext)) return stem + ext;
    return null;
  };
  return (from, spec) => {
    if (spec.startsWith('.')) return tryFile(path.posix.join(path.posix.dirname(from), spec));
    const match = /^(@[^/]+\/[^/]+|[^/@][^/]*)(\/.*)?$/.exec(spec);
    const exports = match && packages.get(match[1]);
    if (!exports) return null;
    const target = exports[match[2] ? `.${match[2]}` : '.'];
    return target ? tryFile(target) : null;
  };
}

/**
 * Edges between the parsed files. `runtime` skips `import type` (erased at build, so it cannot form a runtime cycle);
 * `uses` maps importer -> list of { target, names, namespace } for the unused-export analysis.
 */
export function buildGraph(repo, facts) {
  const resolve = makeResolver(repo);
  const runtime = new Map();
  const uses = [];
  const reexportAll = new Map();
  for (const f of facts) {
    const targets = new Set();
    runtime.set(f.file, targets);
    for (const imp of f.imports) {
      const target = resolve(f.file, imp.spec);
      if (!target) continue;
      if (!imp.typeOnly) targets.add(target);
      uses.push({ from: f.file, target, names: imp.names, namespace: imp.namespace });
    }
    for (const re of f.reexports) {
      const target = resolve(f.file, re.spec);
      if (!target) continue;
      targets.add(target);
      uses.push({ from: f.file, target, names: re.names, namespace: false, reexport: true });
    }
    for (const spec of f.reexportAll) {
      const target = resolve(f.file, spec);
      if (!target) continue;
      targets.add(target);
      reexportAll.set(f.file, [...(reexportAll.get(f.file) ?? []), target]);
      uses.push({ from: f.file, target, names: [], namespace: true, reexport: true });
    }
  }
  return { runtime, uses, reexportAll };
}

/** Strongly connected components with more than one file (Tarjan), each sorted. */
export function findCycles(runtime) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  const connect = (start) => {
    const work = [[start, [...(runtime.get(start) ?? [])], 0]];
    index.set(start, counter);
    low.set(start, counter++);
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, successors] = frame;
      if (frame[2] < successors.length) {
        const next = successors[frame[2]++];
        if (!runtime.has(next)) continue;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter++);
          stack.push(next);
          onStack.add(next);
          work.push([next, [...runtime.get(next)], 0]);
        } else if (onStack.has(next)) low.set(node, Math.min(low.get(node), index.get(next)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        if (component.length > 1) cycles.push(component.sort());
      }
    }
  };
  for (const node of runtime.keys()) if (!index.has(node)) connect(node);
  return cycles.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Importers per file (distinct files), over the files `include` accepts as importers. */
export function fanIn(runtime, include = () => true) {
  const counts = new Map();
  for (const [from, targets] of runtime)
    if (include(from))
      for (const target of targets) counts.set(target, (counts.get(target) ?? 0) + 1);
  return counts;
}

/**
 * Exports no other file imports by name. A namespace or dynamic import uses every export of its target. A re-export is
 * not a use in itself: the name counts as used when whoever imports the barrel uses it. Default exports are skipped.
 */
export function deadExports(facts, uses, { isEntry = () => false } = {}) {
  const byTarget = new Map();
  for (const use of uses) byTarget.set(use.target, [...(byTarget.get(use.target) ?? []), use]);
  const used = (file, name, seen = new Set()) => {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return (byTarget.get(file) ?? []).some((use) => {
      if (!use.namespace && !use.names.includes(name)) return false;
      return use.reexport ? used(use.from, name, seen) : true;
    });
  };
  return facts
    .filter((f) => !isEntry(f.file))
    .flatMap((f) =>
      f.exports
        .filter((e) => e.name !== 'default' && !used(f.file, e.name))
        .map((e) => ({ file: f.file, name: e.name, line: e.line })),
    );
}

/** Files reachable from `roots` along the runtime and type-only edges (all imports). */
export function reachableFrom(roots, uses) {
  const edges = new Map();
  for (const u of uses) edges.set(u.from, [...(edges.get(u.from) ?? []), u.target]);
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    for (const next of edges.get(queue.pop()) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

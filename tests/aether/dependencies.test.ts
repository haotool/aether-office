import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifests = [
  'package.json',
  ...readdirSync('apps').map((d) => `apps/${d}/package.json`),
  ...readdirSync('packages').map((d) => `packages/${d}/package.json`),
].filter(existsSync);
const read = (file: string) =>
  JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | string>;

describe('dependency policy', () => {
  it('pins every direct dependency to an exact version: no ranges, tags or URLs', () => {
    const loose: string[] = [];
    for (const file of manifests)
      for (const kind of ['dependencies', 'devDependencies']) {
        const deps = (read(file)[kind] ?? {}) as Record<string, string>;
        for (const [name, version] of Object.entries(deps))
          if (!/^\d+\.\d+\.\d+$/.test(version) && !version.startsWith('workspace:'))
            loose.push(`${file} ${name}@${version}`);
      }
    expect(loose).toEqual([]);
  });

  it('fixes the runtime and package manager, and commits a single lockfile', () => {
    const root = read('package.json');
    expect(root['packageManager']).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect((root['engines'] as Record<string, string>)['node']).toMatch(/^>=\d+\.\d+\.\d+ <\d+$/);
    expect(readFileSync('.nvmrc', 'utf8').trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync('pnpm-lock.yaml')).toBe(true);
    expect(existsSync('package-lock.json')).toBe(false);
    expect(existsSync('yarn.lock')).toBe(false);
  });

  it('keeps no stale release-age exceptions and no peer or build-script overrides', () => {
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
    const lock = readFileSync('pnpm-lock.yaml', 'utf8');
    for (const entry of [...workspace.matchAll(/^\s+- '?([^'\n]+)'?$/gm)].map((m) => m[1]!)) {
      if (!entry.includes('@') || entry.startsWith('apps/') || entry.startsWith('packages/'))
        continue;
      expect(lock, `stale exception ${entry}`).toContain(entry);
    }
    expect(workspace).not.toMatch(/overrides|legacy-peer|force/i);
    const rootText = readFileSync('package.json', 'utf8');
    expect(rootText).not.toMatch(/"overrides"|"resolutions"|--force|--legacy-peer-deps/);
  });

  it('only lets the three native build scripts run', () => {
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
    const allowed = [...workspace.matchAll(/^\s{2}([\w@/.-]+): true$/gm)].map((m) => m[1]).sort();
    expect(allowed).toEqual(['better-sqlite3', 'esbuild', 'node-pty']);
  });
});

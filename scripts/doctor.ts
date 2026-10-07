import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { resolve } from 'node:path';

// Read-only environment diagnosis. It never starts a model session and never changes anything: it
// reports versions and tells apart a missing CLI, a CLI that needs sign-in, a broken native module
// and a healthy install.

export type Status =
  'ok' | 'missing' | 'auth_required' | 'native_failure' | 'version_mismatch' | 'warn';
export type Check = { id: string; status: Status; detail: string };
export type Exec = {
  kind: 'ok' | 'enoent' | 'failed' | 'timeout';
  stdout: string;
  code: number | null;
};
export type Probe = {
  run: (command: string, args: string[]) => Exec;
  // Resolves from the app that owns the dependency. null = usable, string = failure reason.
  load: (module: string, fromApp: string) => string | null;
  read: (file: string) => string | null;
  list: (directory: string) => string[];
};

const first = (text: string) => text.split('\n')[0] ?? '';
const semver = (text: string) => /\d+\.\d+\.\d+/.exec(text)?.[0] ?? null;

const realProbe: Probe = {
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000 });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')
      return { kind: 'enoent', stdout: '', code: null };
    if (result.error) return { kind: 'timeout', stdout: '', code: null };
    return {
      kind: result.status === 0 ? 'ok' : 'failed',
      stdout: `${result.stdout}${result.stderr}`.trim(),
      code: result.status,
    };
  },
  load: (module, fromApp) => {
    try {
      const loaded = createRequire(resolve(fromApp, 'package.json'))(module);
      // Loading the file is not enough for SQLite: open a database to exercise the native binding.
      if (module === 'better-sqlite3') new loaded(':memory:').close();
      return null;
    } catch (error) {
      return error instanceof Error ? first(error.message) : 'load failed';
    }
  },
  read: (file) => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  },
  list: (directory) => {
    try {
      return readdirSync(directory);
    } catch {
      return [];
    }
  },
};

type Host = { platform: string; arch: string; release: string; node: string };
type Manifest = { engines?: { node?: string }; packageManager?: string };

function nodeCheck(manifest: Manifest, host: Host): Check {
  const wanted = /(\d+\.\d+\.\d+)/.exec(manifest.engines?.node ?? '')?.[1];
  return {
    id: 'node',
    status: wanted && host.node.split('.')[0] !== wanted.split('.')[0] ? 'version_mismatch' : 'ok',
    detail: `node ${host.node}${wanted ? ` (project wants ${manifest.engines?.node})` : ''}`,
  };
}

function pnpmCheck(probe: Probe, manifest: Manifest): Check {
  const pnpm = probe.run('pnpm', ['--version']);
  if (pnpm.kind === 'enoent')
    return { id: 'pnpm', status: 'missing', detail: 'pnpm not found; run via corepack' };
  const pinned = manifest.packageManager?.replace('pnpm@', '');
  return {
    id: 'pnpm',
    status: pinned && semver(pnpm.stdout) !== pinned ? 'version_mismatch' : 'ok',
    detail: `pnpm ${first(pnpm.stdout)}${pinned ? ` (pinned ${pinned})` : ''}`,
  };
}

function vcsCheck(probe: Probe): Check {
  const vcs = probe.run('git', ['--version']);
  return vcs.kind === 'ok'
    ? { id: 'git', status: 'ok', detail: first(vcs.stdout) }
    : { id: 'git', status: 'missing', detail: 'git not found' };
}

function nativeChecks(probe: Probe): Check[] {
  return (
    [
      ['better-sqlite3', 'apps/control'],
      ['node-pty', 'apps/runner'],
    ] as const
  ).map(([module, app]) => {
    const error = probe.load(module, app);
    return error
      ? { id: module, status: 'native_failure', detail: error }
      : { id: module, status: 'ok', detail: 'native module loads' };
  });
}

const PROVIDER_CLIS = [
  { id: 'claude', version: ['--version'], auth: ['auth', 'status'] },
  { id: 'codex', version: ['--version'], auth: ['login', 'status'] },
];

/** The sign-in state of each provider CLI, and a note when the codex version is not one the compat table verified. */
function providerChecks(probe: Probe): Check[] {
  const checks: Check[] = [];
  const verified =
    (
      JSON.parse(probe.read('packages/providers/generated/compat.json') ?? '{}') as {
        verifiedCliVersions?: string[];
      }
    ).verifiedCliVersions ?? [];
  for (const p of PROVIDER_CLIS) {
    const version = probe.run(p.id, p.version);
    if (version.kind === 'enoent') {
      checks.push({
        id: p.id,
        status: 'missing',
        detail: `${p.id} CLI not found on PATH (optional: install it to use ${p.id} sessions)`,
      });
      continue;
    }
    const auth = probe.run(p.id, p.auth);
    const installed = semver(version.stdout);
    checks.push({
      id: p.id,
      status: auth.kind === 'ok' ? 'ok' : 'auth_required',
      detail: `${first(version.stdout)}${auth.kind === 'ok' ? '' : ' — not signed in or sign-in could not be confirmed'}`,
    });
    if (p.id === 'codex' && installed && verified.length && !verified.includes(installed))
      checks.push({
        id: 'codex-version',
        status: 'warn',
        detail: `codex ${installed} is not verified (it probably works); verified versions: ${verified.join(', ')}`,
      });
  }
  return checks;
}

export function checkEnvironment(
  probe: Probe,
  host: Host = {
    platform: platform(),
    arch: arch(),
    release: release(),
    node: process.versions.node,
  },
): Check[] {
  const manifest = JSON.parse(probe.read('package.json') ?? '{}') as Manifest;
  return [
    { id: 'os', status: 'ok', detail: `${host.platform} ${host.release} ${host.arch}` },
    nodeCheck(manifest, host),
    pnpmCheck(probe, manifest),
    vcsCheck(probe),
    ...nativeChecks(probe),
    ...providerChecks(probe),
  ];
}

const mark: Record<Status, string> = {
  ok: '✓',
  missing: '✗',
  auth_required: '!',
  native_failure: '✗',
  version_mismatch: '~',
  warn: '~',
};

/** CLIs for the providers are optional (each is used only for its own sessions); a failing check of anything else is fatal. */
const OPTIONAL = new Set(['claude', 'codex']);

/** 1 when a hard prerequisite is missing or broken; with `strict`, any check that is not ok fails too. */
export function exitCodeOf(checks: Check[], strict: boolean): number {
  const failed = (c: Check) =>
    strict
      ? c.status !== 'ok'
      : (c.status === 'missing' || c.status === 'native_failure') && !OPTIONAL.has(c.id);
  return checks.some(failed) ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = checkEnvironment(realProbe);
  if (process.argv.includes('--json')) console.log(JSON.stringify(checks, null, 2));
  else
    for (const c of checks)
      console.log(
        `${c.status === 'missing' && OPTIONAL.has(c.id) ? '!' : mark[c.status]} ${c.id.padEnd(14)} ${c.status.padEnd(17)} ${c.detail}`,
      );
  process.exitCode = exitCodeOf(checks, process.argv.includes('--strict'));
}

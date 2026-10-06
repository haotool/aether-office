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
      return error instanceof Error ? error.message.split('\n')[0]! : 'load failed';
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

const first = (text: string) => text.split('\n')[0] ?? '';
const semver = (text: string) => /\d+\.\d+\.\d+/.exec(text)?.[0] ?? null;

export function checkEnvironment(
  probe: Probe,
  host: { platform: string; arch: string; release: string; node: string } = {
    platform: platform(),
    arch: arch(),
    release: release(),
    node: process.versions.node,
  },
): Check[] {
  const checks: Check[] = [
    { id: 'os', status: 'ok', detail: `${host.platform} ${host.release} ${host.arch}` },
  ];
  const manifest = JSON.parse(probe.read('package.json') ?? '{}') as {
    engines?: { node?: string };
    packageManager?: string;
  };

  const wanted = /(\d+\.\d+\.\d+)/.exec(manifest.engines?.node ?? '')?.[1];
  checks.push({
    id: 'node',
    status: wanted && host.node.split('.')[0] !== wanted.split('.')[0] ? 'version_mismatch' : 'ok',
    detail: `node ${host.node}${wanted ? ` (project wants ${manifest.engines?.node})` : ''}`,
  });

  const pnpm = probe.run('pnpm', ['--version']);
  const pinned = manifest.packageManager?.replace('pnpm@', '');
  checks.push(
    pnpm.kind === 'enoent'
      ? { id: 'pnpm', status: 'missing', detail: 'pnpm not found; run via corepack' }
      : {
          id: 'pnpm',
          status: pinned && semver(pnpm.stdout) !== pinned ? 'version_mismatch' : 'ok',
          detail: `pnpm ${first(pnpm.stdout)}${pinned ? ` (pinned ${pinned})` : ''}`,
        },
  );

  const git = probe.run('git', ['--version']);
  checks.push(
    git.kind === 'ok'
      ? { id: 'git', status: 'ok', detail: first(git.stdout) }
      : { id: 'git', status: 'missing', detail: 'git not found' },
  );

  for (const [module, app] of [
    ['better-sqlite3', 'apps/control'],
    ['node-pty', 'apps/runner'],
  ] as const) {
    const error = probe.load(module, app);
    checks.push(
      error
        ? { id: module, status: 'native_failure', detail: error }
        : { id: module, status: 'ok', detail: 'native module loads' },
    );
  }

  const providers = [
    { id: 'claude', version: ['--version'], auth: ['auth', 'status'] },
    { id: 'codex', version: ['--version'], auth: ['login', 'status'] },
  ];
  const generated = probe
    .list('packages/providers/generated')
    .find((d) => /^codex-\d/.test(d) && !d.endsWith('-ts') && !d.endsWith('-json'));
  for (const p of providers) {
    const version = probe.run(p.id, p.version);
    if (version.kind === 'enoent') {
      checks.push({ id: p.id, status: 'missing', detail: `${p.id} CLI not found on PATH` });
      continue;
    }
    const auth = probe.run(p.id, p.auth);
    const installed = semver(version.stdout);
    checks.push({
      id: p.id,
      status: auth.kind === 'ok' ? 'ok' : 'auth_required',
      detail: `${first(version.stdout)}${auth.kind === 'ok' ? '' : ' — not signed in or sign-in could not be confirmed'}`,
    });
    if (p.id === 'codex' && generated && installed && !generated.endsWith(installed))
      checks.push({
        id: 'codex-schema',
        status: 'version_mismatch',
        detail: `protocol schema generated for ${generated.replace('codex-', '')}, installed CLI is ${installed}; regenerate and re-run the provider tests`,
      });
  }
  return checks;
}

const mark: Record<Status, string> = {
  ok: '✓',
  missing: '✗',
  auth_required: '!',
  native_failure: '✗',
  version_mismatch: '~',
  warn: '~',
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = checkEnvironment(realProbe);
  if (process.argv.includes('--json')) console.log(JSON.stringify(checks, null, 2));
  else
    for (const c of checks)
      console.log(`${mark[c.status]} ${c.id.padEnd(14)} ${c.status.padEnd(17)} ${c.detail}`);
  process.exitCode = checks.some((c) => c.status === 'missing' || c.status === 'native_failure')
    ? 1
    : 0;
}

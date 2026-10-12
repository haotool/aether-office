import { expect, it } from 'vitest';
import { checkEnvironment, exitCodeOf, type Exec, type Probe } from '../../scripts/doctor.js';

const host = { platform: 'linux', arch: 'x64', release: '6.1', node: '24.21.0' };
const ok = (stdout: string): Exec => ({ kind: 'ok', stdout, code: 0 });

function probe(overrides: Partial<Probe> & { runs?: Record<string, Exec> } = {}): Probe {
  const runs: Record<string, Exec> = {
    'pnpm --version': ok('12.8.1'),
    'git --version': ok('git version 2.50.0'),
    'claude --version': ok('2.1.288 (Claude Code)'),
    'claude auth status': ok('{"loggedIn":true}'),
    'codex --version': ok('codex-cli 0.159.2'),
    'codex login status': ok('Logged in'),
    ...overrides.runs,
  };
  return {
    run: (command, args) =>
      runs[`${command} ${args.join(' ')}`] ?? { kind: 'enoent', stdout: '', code: null },
    load: overrides.load ?? (() => null),
    read: (file) =>
      file.endsWith('compat.json')
        ? JSON.stringify({ verifiedCliVersions: ['0.159.2', '0.160.1'] })
        : JSON.stringify({ engines: { node: '>=24.21.0 <25' }, packageManager: 'pnpm@12.8.1' }),
    list: () => ['codex-0.159.2-ts'],
  };
}
const byId = (checks: ReturnType<typeof checkEnvironment>) =>
  Object.fromEntries(checks.map((c) => [c.id, c.status]));

it('reports a healthy environment', () => {
  const result = byId(checkEnvironment(probe(), host));
  expect(Object.values(result).every((s) => s === 'ok')).toBe(true);
});

it('tells apart a missing CLI, a CLI that needs sign-in, a broken native module and version drift', () => {
  const broken = byId(
    checkEnvironment(
      probe({
        runs: {
          'claude --version': { kind: 'enoent', stdout: '', code: null },
          'codex login status': { kind: 'failed', stdout: 'Not logged in', code: 1 },
          'codex --version': ok('codex-cli 0.170.0'),
        },
        load: (module) => (module === 'node-pty' ? 'posix_spawnp failed' : null),
      }),
      { ...host, node: '22.1.0' },
    ),
  );
  expect(broken).toMatchObject({
    claude: 'missing',
    codex: 'auth_required',
    'node-pty': 'native_failure',
    'better-sqlite3': 'ok',
    node: 'version_mismatch',
    'codex-version': 'warn',
  });
});

it('does not start any model session: only version and status commands are issued', () => {
  const issued: string[] = [];
  const spy: Probe = {
    ...probe(),
    run: (c, a) => (issued.push(`${c} ${a.join(' ')}`), probe().run(c, a)),
  };
  checkEnvironment(spy, host);
  expect(issued.every((c) => /--version|auth status|login status/.test(c))).toBe(true);
});

it('says an unverified but working codex is probably fine, and lists the verified versions', () => {
  const [check] = checkEnvironment(
    probe({ runs: { 'codex --version': ok('codex-cli 0.170.0') } }),
    host,
  ).filter((c) => c.id === 'codex-version');
  expect(check!.detail).toBe(
    'codex 0.170.0 is not verified (it probably works); verified versions: 0.159.2, 0.160.1',
  );
  const verified = checkEnvironment(
    probe({ runs: { 'codex --version': ok('codex-cli 0.160.1') } }),
    host,
  );
  expect(verified.some((c) => c.id === 'codex-version')).toBe(false);
});

it('fails only for a missing hard prerequisite; a missing provider CLI warns, and --strict fails on any warning', () => {
  const gone: Exec = { kind: 'enoent', stdout: '', code: null };
  const noClaude = checkEnvironment(probe({ runs: { 'claude --version': gone } }), host);
  expect(exitCodeOf(noClaude, false)).toBe(0);
  expect(exitCodeOf(noClaude, true)).toBe(1);
  const noVcs = checkEnvironment(probe({ runs: { 'git --version': gone } }), host);
  expect(exitCodeOf(noVcs, false)).toBe(1);
  const brokenPty = checkEnvironment(probe({ load: (m) => (m === 'node-pty' ? 'x' : null) }), host);
  expect(exitCodeOf(brokenPty, false)).toBe(1);
  expect(exitCodeOf(checkEnvironment(probe(), host), true)).toBe(0);
});

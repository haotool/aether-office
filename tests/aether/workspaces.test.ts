import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Workspaces } from '../../apps/runner/src/workspaces.js';
import { budget } from './timing.js';
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'aether git 空白 '));
  const repository = join(directory, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  const git = (args: string[], cwd = repository) =>
    execFileSync(
      'git',
      [
        '-C',
        cwd,
        '-c',
        'user.name=Aether fixture',
        '-c',
        'user.email=fixture@example.invalid',
        ...args,
      ],
      { encoding: 'utf8' },
    ).trim();
  writeFileSync(join(repository, 'hello.txt'), 'original\n');
  git(['add', 'hello.txt']);
  git(['commit', '-qm', 'fixture base']);
  const manager = new Workspaces(join(directory, 'managed'), [repository]);
  const workspace = manager.create(randomUUID(), randomUUID(), 1, repository);
  return {
    directory,
    repository,
    manager,
    workspace,
    git,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
describe('real Git workspaces and immutable verification', () => {
  it('does not expose runner or provider secrets to workspace verification', async () => {
    const f = setup();
    try {
      for (const key of [
        'AETHER_RUNNER_TOKEN',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'UNRELATED_SECRET',
      ])
        vi.stubEnv(key, 'synthetic-secret');
      const harness = f.manager.registerHarness(
        "import assert from 'node:assert/strict'; for (const key of ['AETHER_RUNNER_TOKEN','OPENAI_API_KEY','ANTHROPIC_API_KEY','UNRELATED_SECRET']) assert.equal(process.env[key],undefined,key); assert.ok(process.env.PATH);",
      );
      expect((await f.manager.verify(f.workspace.id, harness.id)).status).toBe('passed');
    } finally {
      vi.unstubAllEnvs();
      f.cleanup();
    }
  });
  it('keeps source dirty WIP, isolates writer, verifies unchanged SHA and refuses destructive cleanup', async () => {
    const f = setup();
    try {
      writeFileSync(join(f.repository, 'user-wip.txt'), 'preserve me');
      expect(existsSync(join(f.workspace.path, 'user-wip.txt'))).toBe(false);
      const harness = f.manager.registerHarness(
        "import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict'; assert.equal(readFileSync('hello.txt','utf8'),'original\\n');",
      );
      const result = await f.manager.verify(f.workspace.id, harness.id);
      expect(result.status).toBe('passed');
      expect(result.before.head).toBe(result.after.head);
      writeFileSync(join(f.workspace.path, 'new.txt'), 'keep this');
      expect(() => f.manager.remove(f.workspace.id)).toThrow('WORKSPACE_NOT_EMPTY');
      expect(f.manager.diff(f.workspace.id).untracked).toEqual(['new.txt']);
      expect(existsSync(join(f.repository, 'user-wip.txt'))).toBe(true);
    } finally {
      f.cleanup();
    }
  });
  it('rejects a test that commits and leaves a clean working tree (R-SHA-01 equivalent)', async () => {
    const f = setup();
    try {
      const harness = f.manager.registerHarness(
        "import {writeFileSync} from 'node:fs'; import {execFileSync} from 'node:child_process'; writeFileSync('hello.txt','changed'); execFileSync('git',['add','hello.txt']); execFileSync('git',['-c','user.name=fixture','-c','user.email=f@example.invalid','commit','-qm','test mutated HEAD']);",
      );
      const result = await f.manager.verify(f.workspace.id, harness.id);
      expect(result.exitCode).toBe(0);
      expect(result.after.status).toBe('');
      expect(result.before.head).not.toBe(result.after.head);
      expect(result.status).toBe('invalidated');
      expect(f.manager.state(f.workspace.path).head).toBe(result.after.head);
      expect(() => f.manager.remove(f.workspace.id)).toThrow('WORKSPACE_HAS_COMMITS');
    } finally {
      f.cleanup();
    }
  });
  it('refuses ungranted roots and base drift without resetting evidence', async () => {
    const f = setup();
    try {
      expect(() => f.manager.create(randomUUID(), randomUUID(), 1, f.directory)).toThrow(
        'REPOSITORY_NOT_GRANTED',
      );
      f.git(['commit', '--allow-empty', '-qm', 'base moved']);
      const harness = f.manager.registerHarness("console.log('ok');");
      await expect(f.manager.verify(f.workspace.id, harness.id)).rejects.toThrow('BASE_DRIFT');
      expect(existsSync(f.workspace.path)).toBe(true);
    } finally {
      f.cleanup();
    }
  });
});

/**
 * Verifies with growing deadlines until the harness got as far as writing `marker` (its last set-up step): a deadline
 * that a loaded machine's slow start overruns kills the harness before the thing under test exists, so that attempt is
 * thrown away and the next gets longer.
 */
async function verifyOnceStarted(
  f: ReturnType<typeof setup>,
  source: (marker: string) => string,
  timeouts: number[],
) {
  const marker = join(f.directory, 'harness-started');
  const mark = `process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)},'');`;
  for (const timeoutMs of timeouts) {
    rmSync(marker, { force: true });
    const harness = f.manager.registerHarness(source(mark), process.execPath, [], timeoutMs);
    const started = Date.now();
    const result = await f.manager.verify(f.workspace.id, harness.id);
    const elapsed = Date.now() - started;
    if (existsSync(marker)) return { result, elapsed, timeoutMs };
  }
  throw new Error('HARNESS_NEVER_STARTED');
}

it('bounds a verifier that ignores SIGTERM and preserves split UTF-8 log bytes', async () => {
  const f = setup();
  try {
    const { result, elapsed, timeoutMs } = await verifyOnceStarted(
      f,
      (mark) =>
        `process.on('SIGTERM',()=>{});const b=Buffer.from('狐狸');process.stdout.write(b.subarray(0,1));setTimeout(()=>{process.stdout.write(b.subarray(1));${mark}},20);setInterval(()=>{},100);`,
      [1500, 6000, 24000],
    );
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('TIMEOUT');
    expect(elapsed).toBeLessThan(budget(3000 + timeoutMs - 1500, 30_000));
    expect(readFileSync(join(f.manager.root, 'artifacts', result.id, 'output.log'), 'utf8')).toBe(
      '狐狸',
    );
  } finally {
    f.cleanup();
  }
}, 90_000);

it.skipIf(process.platform === 'win32')(
  'bounds descendants holding output open after their verifier parent exits',
  async () => {
    const f = setup();
    try {
      const descendant = "process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),40000);";
      const { result, elapsed } = await verifyOnceStarted(
        f,
        (mark) =>
          `import {spawn} from 'node:child_process';spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2]});${mark}setTimeout(()=>process.exit(0),100);`,
        [300, 1500, 6000],
      );
      expect(result.reason).toBe('TIMEOUT');
      expect(result.status).toBe('failed');
      expect(elapsed).toBeLessThan(budget(3000, 20_000));
    } finally {
      f.cleanup();
    }
  },
  60_000,
);

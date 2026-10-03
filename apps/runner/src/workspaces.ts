import { StringDecoder } from 'node:string_decoder';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
export type Workspace = {
  id: string;
  projectId: string;
  workId: string;
  attempt: number;
  repository: string;
  path: string;
  branch: string;
  baseSha: string;
  createdAt: number;
};
export type GitState = { head: string; tree: string; indexTree: string; status: string };
export type Harness = {
  id: string;
  executable: string;
  args: string[];
  sourceFile: string;
  sourceHash: string;
  hash: string;
  timeoutMs: number;
};
export type Verification = {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  status: 'passed' | 'failed' | 'invalidated' | 'cancelled';
  before: GitState;
  after: GitState;
  baseBefore: string;
  baseAfter: string;
  harnessHash: string;
  harnessSourceHash: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number;
  logHash: string;
  reason: string | null;
};
const identifier = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new Error('INVALID_ID');
  return value;
};
const sha = (value: string) => {
  if (!/^[0-9a-f]{40,64}$/.test(value)) throw new Error('INVALID_SHA');
  return value;
};
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const inside = (root: string, target: string) => {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};
export function environment(): NodeJS.ProcessEnv {
  // Verifiers execute workspace code: never inherit runner or provider credentials.
  return {
    ...Object.fromEntries(
      ['PATH', 'HOME', 'USER', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SystemRoot'].flatMap(
        (key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]),
      ),
    ),
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
}
export class Workspaces {
  readonly root: string;
  readonly allowed: string[];
  readonly hooks: string;
  constructor(directory: string, allowedRepositories: string[]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.root = realpathSync(directory);
    this.allowed = allowedRepositories.map((p) => realpathSync(p));
    this.hooks = join(this.root, 'empty-hooks');
    mkdirSync(this.hooks, { recursive: true, mode: 0o700 });
    for (const dir of ['registry', 'checkouts', 'harnesses', 'artifacts'])
      mkdirSync(join(this.root, dir), { recursive: true, mode: 0o700 });
  }
  /** Managed scratch directory under the runner root, created on demand. */
  scratch(name: string): string {
    const directory = join(this.root, name);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
  }
  private git(cwd: string, args: string[]): string {
    return execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-c',
        `core.hooksPath=${this.hooks}`,
        '-c',
        'core.fsmonitor=false',
        '-C',
        cwd,
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
        env: environment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trimEnd();
  }
  private repository(path: string): string {
    const canonical = realpathSync(path);
    if (!this.allowed.includes(canonical)) throw new Error('REPOSITORY_NOT_GRANTED');
    if (realpathSync(this.git(canonical, ['rev-parse', '--show-toplevel'])) !== canonical)
      throw new Error('REPOSITORY_ROOT_REQUIRED');
    return canonical;
  }
  load(id: string): Workspace {
    const workspace = JSON.parse(
      readFileSync(join(this.root, 'registry', identifier(id) + '.json'), 'utf8'),
    ) as Workspace;
    this.repository(workspace.repository);
    if (
      !inside(join(this.root, 'checkouts'), resolve(workspace.path)) ||
      lstatSync(workspace.path).isSymbolicLink() ||
      realpathSync(workspace.path) !== resolve(workspace.path)
    )
      throw new Error('WORKSPACE_PATH_ESCAPE');
    if (this.git(workspace.path, ['rev-parse', '--show-toplevel']) !== workspace.path)
      throw new Error('WORKSPACE_IDENTITY_MISMATCH');
    if (this.git(workspace.path, ['symbolic-ref', '--short', 'HEAD']) !== workspace.branch)
      throw new Error('WORKSPACE_BRANCH_CHANGED');
    return workspace;
  }
  create(
    projectId: string,
    workId: string,
    attempt: number,
    repository: string,
    review?: { runId: string; headSha: string },
  ): Workspace {
    identifier(projectId);
    identifier(workId);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > 100)
      throw new Error('INVALID_ATTEMPT');
    const repo = this.repository(repository);
    const id = randomUUID();
    const baseSha = sha(
      this.git(repo, [
        'rev-parse',
        '--verify',
        review ? sha(review.headSha) + '^{commit}' : 'HEAD^{commit}',
      ]),
    );
    const branch = `aether/${workId}/${review ? 'review-' + identifier(review.runId) : attempt}`;
    this.git(repo, ['check-ref-format', '--branch', branch]);
    const path = join(this.root, 'checkouts', id);
    if (existsSync(path)) throw new Error('WORKSPACE_EXISTS');
    this.git(repo, ['worktree', 'add', '-b', branch, '--', path, baseSha]);
    const workspace = {
      id,
      projectId,
      workId,
      attempt,
      repository: repo,
      path,
      branch,
      baseSha,
      createdAt: Date.now(),
    };
    writeFileSync(join(this.root, 'registry', id + '.json'), JSON.stringify(workspace, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    return workspace;
  }
  reviewDiff(id: string, baseSha: string): string {
    const workspace = this.load(id);
    const diff = this.git(workspace.path, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      sha(baseSha),
      workspace.baseSha,
      '--',
    ]);
    if (Buffer.byteLength(diff) > 60000) throw new Error('REVIEW_DIFF_TOO_LARGE');
    return diff;
  }
  state(path: string): GitState {
    return {
      head: sha(this.git(path, ['rev-parse', 'HEAD'])),
      tree: sha(this.git(path, ['rev-parse', 'HEAD^{tree}'])),
      indexTree: sha(this.git(path, ['write-tree'])),
      status: this.git(path, ['status', '--porcelain=v1', '--untracked-files=all']),
    };
  }
  diff(id: string): { baseSha: string; headSha: string; text: string; untracked: string[] } {
    const workspace = this.load(id);
    const state = this.state(workspace.path);
    const text = this.git(workspace.path, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--binary',
      workspace.baseSha,
      '--',
    ]);
    const untracked = this.git(workspace.path, ['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean);
    return { baseSha: workspace.baseSha, headSha: state.head, text, untracked };
  }
  /** Registers an external immutable verifier script, outside all agent worktrees. */
  registerHarness(
    source: string,
    executable: string = process.execPath,
    extraArgs: string[] = [],
    timeoutMs = 30000,
  ): Harness {
    if (
      !isAbsolute(executable) ||
      !existsSync(executable) ||
      extraArgs.some((arg) => arg.includes('\0')) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 120000
    )
      throw new Error('INVALID_HARNESS');
    const id = randomUUID();
    const file = join(this.root, 'harnesses', id + '.mjs');
    writeFileSync(file, source, { mode: 0o400, flag: 'wx' });
    const definition = {
      id,
      executable,
      args: [file, ...extraArgs],
      sourceFile: file,
      sourceHash: digest(source),
      timeoutMs,
    };
    const harness = { ...definition, hash: digest(JSON.stringify(definition)) };
    writeFileSync(join(this.root, 'harnesses', id + '.json'), JSON.stringify(harness), {
      mode: 0o400,
      flag: 'wx',
    });
    return harness;
  }
  async verify(id: string, harnessId: string, signal?: AbortSignal): Promise<Verification> {
    const workspace = this.load(id);
    const harness = JSON.parse(
      readFileSync(join(this.root, 'harnesses', identifier(harnessId) + '.json'), 'utf8'),
    ) as Harness;
    const { hash: expected, ...definition } = harness;
    if (
      expected !== digest(JSON.stringify(definition)) ||
      !inside(join(this.root, 'harnesses'), harness.sourceFile) ||
      digest(readFileSync(harness.sourceFile)) !== harness.sourceHash
    )
      throw new Error('HARNESS_CHANGED');
    const before = this.state(workspace.path);
    if (before.status) throw new Error('WORKSPACE_DIRTY_BEFORE_TEST');
    const baseBefore = sha(this.git(workspace.repository, ['rev-parse', 'HEAD']));
    if (baseBefore !== workspace.baseSha) throw new Error('BASE_DRIFT');
    const startedAt = Date.now();
    const verificationId = randomUUID();
    let output = '';
    let outputBytes = 0;
    const decoder = new StringDecoder('utf8');
    let capped = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(harness.executable, harness.args, {
      cwd: workspace.path,
      env: environment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    // The owned POSIX group can outlive its leader while descendants retain pipes.
    const signalChild = (signal: NodeJS.Signals) => {
      if (process.platform !== 'win32' && child.pid)
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    const stop = () => {
      signalChild('SIGTERM');
      killTimer ??= setTimeout(() => signalChild('SIGKILL'), 1000);
    };
    const collect = (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) {
        capped = true;
        stop();
        return;
      }
      output += decoder.write(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, harness.timeoutMs);
    timer.unref();
    if (signal?.aborted) stop();
    let exitCode: number | null;
    try {
      exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('close', resolve);
        child.once('error', reject);
      });
    } finally {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', stop);
      output += decoder.end();
    }
    const after = this.state(workspace.path);
    const baseAfter = sha(this.git(workspace.repository, ['rev-parse', 'HEAD']));
    const changed =
      before.head !== after.head ||
      before.tree !== after.tree ||
      before.indexTree !== after.indexTree ||
      !!after.status ||
      baseBefore !== baseAfter ||
      digest(readFileSync(harness.sourceFile)) !== harness.sourceHash;
    const status = signal?.aborted
      ? 'cancelled'
      : changed
        ? 'invalidated'
        : exitCode === 0 && !capped && !timedOut
          ? 'passed'
          : 'failed';
    const result: Verification = {
      schemaVersion: 1,
      id: verificationId,
      workspaceId: id,
      status,
      before,
      after,
      baseBefore,
      baseAfter,
      harnessHash: harness.hash,
      harnessSourceHash: harness.sourceHash,
      exitCode,
      startedAt,
      finishedAt: Date.now(),
      logHash: digest(output),
      reason: changed
        ? 'GIT_OR_HARNESS_CHANGED'
        : timedOut
          ? 'TIMEOUT'
          : capped
            ? 'OUTPUT_LIMIT'
            : null,
    };
    const artifacts = join(this.root, 'artifacts', verificationId);
    mkdirSync(artifacts, { mode: 0o700 });
    writeFileSync(join(artifacts, 'output.log'), output, { mode: 0o600 });
    writeFileSync(join(artifacts, 'verification.json'), JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
    return result;
  }
  remove(id: string): void {
    const workspace = this.load(id);
    if (
      this.git(workspace.path, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored'])
    )
      throw new Error('WORKSPACE_NOT_EMPTY');
    if (this.git(workspace.path, ['rev-list', '--count', `${workspace.baseSha}..HEAD`]) !== '0')
      throw new Error('WORKSPACE_HAS_COMMITS');
    this.git(workspace.repository, ['worktree', 'remove', '--', workspace.path]);
    // Branch and registry are retained for provenance; cleanup never uses --force.
  }
}

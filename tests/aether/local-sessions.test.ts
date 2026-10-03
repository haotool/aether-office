import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attributeSessions,
  parseGitStatus,
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';

it('parses branch, upstream, ahead/behind and uncommitted counts', () => {
  expect(parseGitStatus('## main...origin/main [ahead 2, behind 1]\n M a\n?? b\n')).toEqual({
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    uncommitted: 2,
  });
  expect(parseGitStatus('## feat/x.y\n')).toEqual({
    branch: 'feat/x.y',
    upstream: null,
    ahead: 0,
    behind: 0,
    uncommitted: 0,
  });
});

it('discovers claude + codex sessions as metadata only, with real git state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-home-'));
  const repo = join(home, 'work', 'my repo');
  await mkdir(repo, { recursive: true });
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore' });
  git('init', '-q');
  await writeFile(join(repo, 'dirty.txt'), 'x');
  const claudeDir = join(home, '.claude/projects/-x');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    join(claudeDir, 'abc-123.jsonl'),
    `${JSON.stringify({ type: 'user', cwd: repo, message: { content: 'SECRET PROMPT' } })}\n`,
  );
  const codexDir = join(home, '.codex/sessions/2026/10/01');
  await mkdir(codexDir, { recursive: true });
  const uuid = '019a1b2c-0000-7000-8000-123456789abc';
  await writeFile(
    join(codexDir, `rollout-2026-10-01T10-00-00-${uuid}.jsonl`),
    `${JSON.stringify({ type: 'session_meta', payload: { id: uuid, cwd: repo } })}\n`,
  );
  await writeFile(join(claudeDir, 'nocwd.jsonl'), '{"type":"summary"}\n');
  resetLocalSessionCache();
  const out = await scanLocalSessions(home);
  expect(out.map((s) => s.key).sort()).toEqual(['claude:abc-123', `codex:${uuid}`]);
  expect(out.every((s) => s.repo === 'my repo' && s.git?.uncommitted === 1)).toBe(true);
  expect(JSON.stringify(out)).not.toContain('SECRET');
  expect(await scanLocalSessions(join(home, 'missing'), Date.now() + 10_000)).toEqual([]);
});

it('does not list a session’s subagent transcripts as sessions of their own', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-sub-'));
  const dir = join(home, '.claude/projects/-x/parent-1/subagents');
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify({ type: 'user', cwd: home })}\n`;
  await writeFile(join(home, '.claude/projects/-x/parent-1.jsonl'), line);
  await writeFile(join(dir, 'agent-aaaa.jsonl'), line);
  resetLocalSessionCache();
  const found = await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl'));
  expect(found.map((s) => s.sessionId)).toEqual(['parent-1']);
});

it('folds an active spawned Codex rollout into its parent session as a subagent', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-codex-'));
  const dir = join(home, '.codex/sessions/2026/10/04');
  await mkdir(dir, { recursive: true });
  const parent = '01a100f1-0000-7000-8000-000000000001';
  const child = '01a10196-0000-7000-8000-000000000002';
  const meta = (id: string, cwd: string, source: unknown) =>
    `${JSON.stringify({ type: 'session_meta', payload: { id, cwd, source, base_instructions: 'x'.repeat(20000) } })}\n`;
  await writeFile(join(dir, `rollout-t-${parent}.jsonl`), meta(parent, home, 'exec'));
  await writeFile(
    join(dir, `rollout-t-${child}.jsonl`),
    meta(child, join(home, 'plugin-cache'), {
      subagent: { thread_spawn: { parent_thread_id: parent, agent_role: 'worker' } },
    }),
  );
  resetLocalSessionCache();
  const found = await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl'));
  expect(found.map((s) => s.sessionId)).toEqual([parent]); // the child is not a session of its own
  expect(found[0]!.subagents.map((s) => s.type)).toEqual(['worker']);
});

it('attributes a headless session in a Claude scratch directory to the project it was launched for', () => {
  const session = (cwd: string) =>
    ({
      key: cwd,
      provider: 'codex',
      sessionId: cwd,
      cwd,
      repo: 'x',
      mtime: 0,
      git: null,
      worktree: null,
      hook: null,
      subagents: [],
    }) as never;
  const projects = [{ id: 'p-bunny', root: '/Users/dev/Tools/ledger-api' }];
  const found = attributeSessions(
    [
      session(
        '/private/tmp/claude-501/-Users-dev-Tools-ledger-api/abc/scratchpad/blind/out',
      ),
      session('/private/tmp/claude-501/-Users-dev-Tools-other/abc/scratchpad'),
      session('/private/tmp/unrelated/dir'),
    ],
    projects,
  );
  expect(found.map((s) => s.projectId)).toEqual(['p-bunny', null, null]);
});

it('finds Codex sessions in every YYYY/MM/DD shard', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-budget-'));
  const line = `${JSON.stringify({ type: 'session_meta', payload: { cwd: home } })}\n`;
  for (const day of ['01', '02', '03']) {
    const dir = join(home, '.codex/sessions/2026/10', day);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `rollout-t-0000000${day}-0000-4000-8000-000000000000.jsonl`), line);
  }
  resetLocalSessionCache();
  const found = await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl'));
  expect(found.map((s) => s.sessionId)).toHaveLength(3);
  expect(found.every((s) => s.cwd === home)).toBe(true);
});

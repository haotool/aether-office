import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
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

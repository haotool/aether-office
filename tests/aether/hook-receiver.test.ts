import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outcomeOf, toRecord } from '../../packages/providers/src/hook-receiver.mjs';
import { deriveHookState } from '../../apps/control/src/services/hooks/hook-spool.js';

const receiver = join(process.cwd(), 'packages/providers/src/hook-receiver.mjs');
const SECRET = `ghp_${'0123456789abcdefghij'}0123456789abcdef`;
const base = { session_id: 's1', cwd: '/w' };

describe('hook receiver: labels, ids and outcomes', () => {
  it('records labels for a command and none of its arguments, paths or secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aether-recv-'));
    const spool = join(dir, 'spool.jsonl');
    const command = `API_TOKEN=${SECRET} git push --force https://u:${SECRET}@host.test/acme/private-repo.git hidden-branch /Users/someone/secret/path`;
    const run = (payload: object, provider = 'claude') =>
      spawnSync(process.execPath, [receiver, provider], {
        input: JSON.stringify({ ...base, ...payload }),
        env: { ...process.env, AETHER_HOOK_SPOOL: spool },
      });
    expect(
      run({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_use_id: 'toolu_01abc',
        tool_input: { command, description: 'private description' },
      }).status,
    ).toBe(0);
    expect(
      run({
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_use_id: 'toolu_02',
        tool_input: { pattern: `TODO ${SECRET}`, path: '/Users/someone/secret' },
      }).status,
    ).toBe(0);
    const text = await readFile(spool, 'utf8');
    // The whole spool, as bytes on disk: no argument, path, host, branch, repository or token anywhere.
    for (const leak of [
      SECRET,
      'someone',
      'secret',
      'host.test',
      'acme',
      'private',
      'hidden-branch',
    ])
      expect(text).not.toContain(leak);
    const [bash, grep] = text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(bash).toMatchObject({
      tool: 'Bash',
      target: 'git push',
      toolUseId: 'toolu_01abc',
      tags: ['git.push', 'git.push.force'],
    });
    expect(grep).toMatchObject({ tool: 'Grep', tags: ['search.todo'] });
    expect(Object.keys(bash).sort()).toEqual(
      ['at', 'cwd', 'event', 'provider', 'sessionId', 'tags', 'target', 'tool', 'toolUseId'].sort(),
    );
  });

  it('reads Codex commands (`cmd`, or an argument list) the same way', () => {
    const pre = (tool_input: object) =>
      toRecord('codex', {
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'exec_command',
        tool_input,
      });
    expect(pre({ cmd: 'pnpm test' })?.tags).toEqual(['test']);
    expect(pre({ command: ['git', 'commit', '-m', 'x'] })?.tags).toEqual(['git.commit']);
    expect(pre({ cmd: 'ls' })?.tags).toBeUndefined();
  });

  it('puts labels only on a call that is starting, never on its end', () => {
    const post = toRecord('claude', {
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'pnpm test' },
    });
    expect(post?.tags).toBeUndefined();
  });

  it('says how a call ended only when the provider said so', () => {
    const at = (event: string, extra: object = {}) => ({ hook_event_name: event, ...extra });
    expect(outcomeOf('claude', at('PostToolUse'))).toBe(true);
    expect(outcomeOf('claude', at('PostToolUseFailure', { error: 'Exit code 1' }))).toBe(false);
    expect(outcomeOf('claude', at('PostToolUseFailure', { is_interrupt: true }))).toBeUndefined();
    expect(outcomeOf('claude', at('PreToolUse'))).toBeUndefined();
    expect(outcomeOf('claude', at('Stop'))).toBeUndefined();
    expect(outcomeOf('codex', at('PostToolUse'))).toBeUndefined();
    expect(outcomeOf('codex', at('PostToolUse', { tool_response: { exit_code: 0 } }))).toBe(true);
    expect(
      outcomeOf('codex', at('PostToolUse', { tool_response: { metadata: { exit_code: 2 } } })),
    ).toBe(false);
    expect(outcomeOf('codex', at('PostToolUse', { tool_response: '{"exit_code":0}' }))).toBe(true);
    expect(
      outcomeOf('codex', at('PostToolUse', { tool_response: { exit_code: 'zero' } })),
    ).toBeUndefined();
    expect(
      outcomeOf('codex', at('PostToolUse', { tool_response: 'plain text exit_code: 0' })),
    ).toBeUndefined();
  });

  it('keeps an opaque id only when it looks like one', () => {
    const rec = (id: unknown) =>
      toRecord('claude', { ...base, hook_event_name: 'PostToolUse', tool_use_id: id });
    expect(rec('toolu_0123')?.toolUseId).toBe('toolu_0123');
    expect(rec('has spaces and /slashes')?.toolUseId).toBeUndefined();
    expect(rec('x'.repeat(200))?.toolUseId).toBeUndefined();
    expect(rec(42)?.toolUseId).toBeUndefined();
  });
});

describe('hook state: outcomes by id, labels from the closed vocabulary', () => {
  const rec = (event: string, at: number, extra: object = {}) => ({
    at,
    provider: 'claude' as const,
    event,
    sessionId: 's1',
    cwd: '/w',
    ...extra,
  });
  const state = (records: object[]) => deriveHookState(records as never, 100_000).get('claude:s1')!;

  it('settles a call by its tool id and by nothing else', () => {
    const s = state([
      rec('PreToolUse', 1, { tool: 'Bash', toolUseId: 'a', tags: ['test'] }),
      rec('PreToolUse', 2, { tool: 'Bash', toolUseId: 'b', tags: ['build'] }),
      rec('PreToolUse', 3, { tool: 'Bash', toolUseId: 'c' }),
      rec('PostToolUseFailure', 4, { tool: 'Bash', toolUseId: 'a', ok: false }),
      rec('PostToolUse', 5, { tool: 'Bash', toolUseId: 'b', ok: true }),
      rec('PostToolUse', 6, { tool: 'Bash', ok: true }),
    ]);
    expect(s.recent.map((c) => [c.tags, c.ok])).toEqual([
      [['test'], false],
      [['build'], true],
      [[], null],
    ]);
    expect(s.activity).toBe('working');
  });

  it('drops a label that is not in the vocabulary (an older or newer receiver) instead of trusting it', () => {
    const s = state([
      rec('PreToolUse', 1, { tool: 'Bash', tags: ['test', 'rm -rf /secret-path'] }),
    ]);
    expect(s.recent[0]!.tags).toEqual(['test']);
  });

  it('keeps a spool written before outcomes existed readable', () => {
    const s = state([
      rec('PreToolUse', 1, { tool: 'Read', target: 'a.ts' }),
      rec('PostToolUse', 2, { tool: 'Read' }),
    ]);
    expect(s.recent).toEqual([
      { tool: 'Read', target: 'a.ts', at: 1, agentId: null, tags: [], ok: null, toolUseId: null },
    ]);
  });
});

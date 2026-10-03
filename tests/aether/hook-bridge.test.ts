import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toRecord } from '../../packages/providers/src/hook-receiver.mjs';
import { deriveHookState, parseSpool } from '../../apps/control/src/services/hook-spool.js';
import {
  attributeSessions,
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';

const receiver = join(process.cwd(), 'packages/providers/src/hook-receiver.mjs');
const rec = (event: string, at: number, extra = {}) => ({
  at,
  provider: 'claude' as const,
  event,
  sessionId: 's1',
  cwd: '/x',
  ...extra,
});

it('derives parent state and live subagents; subagent traffic never idles the parent', () => {
  const states = deriveHookState(
    [
      rec('UserPromptSubmit', 1),
      rec('SubagentStart', 2, { agentId: 'a1', agentType: 'Explore' }),
      rec('SubagentStart', 3, { agentId: 'a2', agentType: 'Plan' }),
      rec('Stop', 4, { agentId: 'a1', agentType: 'Explore' }),
      rec('SubagentStop', 5, { agentId: 'a1', agentType: 'Explore' }),
    ],
    10,
  );
  const s = states.get('claude:s1')!;
  expect(s.activity).toBe('working');
  expect(s.subagents.map((x) => x.id)).toEqual(['a2']);
  expect(deriveHookState([rec('Stop', 1)], 2).get('claude:s1')?.activity).toBe('idle');
  expect(deriveHookState([rec('SessionEnd', 1)], 2).get('claude:s1')?.subagents).toEqual([]);
  expect(deriveHookState([rec('SubagentStart', 1, { agentId: 'z' })], 11 * 60_000).size).toBe(1);
  expect(parseSpool('garbage\n{"x":1}\n')).toEqual([]);
});

it('receiver stores only ids and never prompt text, and exits 0 on garbage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-spool-'));
  const env = { ...process.env, AETHER_HOOK_SPOOL: join(dir, 'spool.jsonl') };
  const payload = {
    hook_event_name: 'SubagentStart',
    session_id: 's1',
    cwd: '/w',
    agent_id: 'a',
    agent_type: 'Plan',
    prompt: 'SECRET',
  };
  expect(
    spawnSync(process.execPath, [receiver, 'codex'], { input: JSON.stringify(payload), env })
      .status,
  ).toBe(0);
  expect(spawnSync(process.execPath, [receiver, 'claude'], { input: 'not json', env }).status).toBe(
    0,
  );
  const line = await readFile(join(dir, 'spool.jsonl'), 'utf8');
  expect(line.trim().split('\n')).toHaveLength(1);
  expect(line).not.toContain('SECRET');
  expect(JSON.parse(line)).toMatchObject({
    provider: 'codex',
    event: 'SubagentStart',
    agentId: 'a',
  });
});

it('groups linked worktrees under one project and attaches hook state and subagents', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-wt-'));
  const main = join(home, 'proj');
  const linked = join(home, 'proj-feature');
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-C', cwd, ...a], { stdio: 'ignore' });
  await mkdir(main);
  git(main, 'init', '-q');
  git(
    main,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'i',
  );
  git(main, 'worktree', 'add', '-q', '-b', 'feat', linked);
  const dir = join(home, '.claude/projects/p');
  await mkdir(dir, { recursive: true });
  for (const [id, cwd] of [
    ['m1', main],
    ['w1', linked],
  ] as const)
    await writeFile(join(dir, `${id}.jsonl`), `${JSON.stringify({ cwd })}\n`);
  const spool = join(home, 'spool.jsonl');
  const lines = [
    {
      at: Date.now(),
      provider: 'claude',
      event: 'SubagentStart',
      sessionId: 'w1',
      cwd: linked,
      agentId: 'a1',
      agentType: 'Explore',
    },
  ];
  await writeFile(spool, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  resetLocalSessionCache();
  const out = await scanLocalSessions(home, Date.now(), 0, spool);
  const by = Object.fromEntries(out.map((s) => [s.sessionId, s]));
  expect(by['m1']!.worktree).toMatchObject({ project: 'proj', linked: false });
  expect(by['w1']!.worktree).toMatchObject({ project: 'proj', linked: true });
  expect(by['w1']!.repo).toBe('proj');
  expect(by['w1']!.subagents.map((s) => s.type)).toEqual(['Explore']);
  expect(by['m1']!.hook).toBeNull();

  // Both checkouts belong to the one project rooted at the main checkout; with no such project they are unowned.
  const projectId = '11111111-1111-4111-8111-111111111111';
  const owned = attributeSessions(out, [{ id: projectId, root: main }]);
  expect(owned.map((s) => s.projectId)).toEqual(out.map(() => projectId));
  // A project rooted at a linked worktree is not the main checkout, so it owns nothing.
  expect(
    attributeSessions(out, [{ id: projectId, root: linked }]).every((s) => s.projectId === null),
  ).toBe(true);
  expect(attributeSessions(out, []).every((s) => s.projectId === null)).toBe(true);
});

it('shows the running tool by name only, from PreToolUse until the next event, never its input', () => {
  const pre = rec('PreToolUse', 1, { tool: 'Bash' });
  const state = (records: ReturnType<typeof rec>[]) =>
    deriveHookState(records, 2).get('claude:s1')?.tool;
  expect(state([pre])).toBe('Bash');
  expect(state([pre, rec('PostToolUse', 2, { tool: 'Bash' })])).toBeNull();
  const record = toRecord('claude', {
    session_id: 's1',
    cwd: '/x',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo SECRET' },
  });
  expect(record?.tool).toBe('Bash');
  expect(JSON.stringify(record)).not.toContain('SECRET');
  expect(
    toRecord('claude', { session_id: 's', cwd: '/x', hook_event_name: 'x', tool_name: 'a b; rm' })
      ?.tool,
  ).toBeUndefined();
});

it('marks a session as waiting for approval from PermissionRequest or a permission Notification until its next event', () => {
  const state = (records: ReturnType<typeof rec>[]) =>
    deriveHookState(records, 9).get('claude:s1')?.activity;
  expect(state([rec('PreToolUse', 1), rec('PermissionRequest', 2)])).toBe('waiting_permission');
  expect(
    state([rec('PreToolUse', 1), rec('Notification', 2, { notification: 'permission_prompt' })]),
  ).toBe('waiting_permission');
  expect(state([rec('Notification', 2, { notification: 'elicitation_dialog' })])).toBe(
    'waiting_permission',
  );
  expect(state([rec('Notification', 2, { notification: 'idle_prompt' })])).toBe('idle');
  expect(state([rec('PermissionRequest', 2), rec('PostToolUse', 3)])).toBe('working');
  expect(state([rec('PermissionRequest', 2), rec('Stop', 3)])).toBe('idle');
  const record = toRecord('claude', {
    session_id: 's',
    cwd: '/x',
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    message: 'Claude needs your permission to run SECRET',
  });
  expect(record?.notification).toBe('permission_prompt');
  expect(JSON.stringify(record)).not.toContain('SECRET');
});

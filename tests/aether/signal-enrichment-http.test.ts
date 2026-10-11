import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { localSessionSchema } from '../../packages/contracts/src/index.js';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { resetOutcomeCache } from '../../apps/control/src/services/runtime/tool-outcomes.js';
import { fixture } from './fixture.js';
import {
  FRESH_PER_MESSAGE,
  append,
  assistantLine,
  textBlock,
  toolBlock,
  toolResultLine,
  writeSession,
  writeSubagent,
} from './fixtures/claude-subagents.js';
import { freePort } from './timing.js';

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = `ghp_${'0123456789abcdefghij'}0123456789abcdef`;
const receiver = join(process.cwd(), 'packages/providers/src/hook-receiver.mjs');

let closers: (() => Promise<void> | void)[] = [];
beforeEach(() => {
  closers = [];
});
afterEach(async () => {
  delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
  delete process.env['AETHER_HOOK_SPOOL'];
  for (const close of closers.reverse()) await close();
});

it('serves labels, outcomes, subagent facts and conflicts over real HTTP with nothing raw in the answer', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-sigs-'));
  const parent = await writeSession(home, 'sess-1');
  const spool = join(home, 'spool.jsonl');
  const run = (payload: object) =>
    spawnSync(process.execPath, [receiver, 'claude'], {
      input: JSON.stringify({ session_id: 'sess-1', cwd: home, ...payload }),
      env: { ...process.env, AETHER_HOOK_SPOOL: spool },
    });
  const command = `API_TOKEN=${SECRET} git push --force https://u:${SECRET}@host.test/acme/private-repo.git hidden-branch`;
  run({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_push',
    tool_input: { command },
  });
  run({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_push',
    tool_input: { command },
  });
  run({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_test',
    tool_input: { command: 'pnpm test' },
  });
  run({
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_use_id: 'toolu_test',
    error: `Exit code 1 ${SECRET}`,
  });
  run({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_build',
    tool_input: { command: 'pnpm build' },
  });
  await append(parent, toolResultLine('toolu_build', false));

  const done = new Date(Date.now() - 3 * 60_000);
  await writeSubagent(parent, {
    id: 'sub1',
    at: done,
    type: 'Explore',
    description: `Check ${SECRET} usage in the module`, // paths are kept on purpose (docs/security.md); secrets are not
    lines: [
      assistantLine('sub1', toolBlock('Read'), done),
      assistantLine(
        'sub1',
        textBlock(
          `## Result\nFound it. password=hunter2hunter2 and ${SECRET}\n<script>alert(1)</script>`,
        ),
        done,
      ),
    ],
  });

  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  process.env['AETHER_HOOK_SPOOL'] = spool;
  resetLocalSessionCache();
  resetOutcomeCache();
  const f = fixture();
  const app = createServer(f.control, { origin: BASE });
  await app.listen({ host: '127.0.0.1', port: PORT });
  closers.push(
    () => app.close(),
    () => f.control.close(),
  );

  const response = await fetch(`${BASE}/api/local-sessions`, {
    headers: { authorization: `Bearer ${f.owner.token}` },
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  for (const leak of [
    SECRET,
    'hunter2',
    'host.test',
    'acme',
    'private-repo',
    'hidden-branch',
    '<script',
    'toolu_',
  ])
    expect(body).not.toContain(leak);

  const { sessions } = JSON.parse(body) as { sessions: unknown[] };
  const session = localSessionSchema.parse(sessions[0]);
  expect(session.hook!.recent.map((c) => [c.tags, c.ok])).toEqual([
    [['git.push', 'git.push.force'], true],
    [['test'], false],
    [['build'], true],
  ]);
  const [child] = session.subagents;
  expect(child).toMatchObject({
    id: 'sub1',
    type: 'Explore',
    status: 'finished',
    source: 'transcript',
    tools: { count: 1, last: 'Read' },
    tokens: { total: 2 * FRESH_PER_MESSAGE },
  });
  expect(child!.label!.length).toBeLessThanOrEqual(60);
  expect(child!.result!.summary.length).toBeLessThanOrEqual(160);
  expect(child!.result!.summary).toContain('Found it.');
  expect(session.git).toBeNull();
});

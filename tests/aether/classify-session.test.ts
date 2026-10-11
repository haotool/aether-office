import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Agent, LocalSession } from '../../packages/contracts/src/index.js';
import {
  ROLE_LABELS,
  classifySession,
  roleOfSubagent,
  scoreSession,
  settle,
  type Settled,
} from '../../packages/kernel/src/index.js';
import {
  claudeActions,
  codexActions,
} from '../../apps/control/src/services/sessions/session-work.js';
import { roleOf, resetRoles } from '../../apps/control/src/services/sessions/session-role.js';
import { mergeLayout } from '../../apps/web/src/features/office/layout-merge.js';
import { roleResolver } from '../../apps/web/src/lib/sessions/localSessions.js';
import { roleWhy } from '../../apps/web/src/features/office/role-why.js';
import { translate } from '../../apps/web/src/lib/i18n/i18n.js';
import { CORPUS } from './fixtures/session-corpus.js';

describe('labelled corpus', () => {
  const results = CORPUS.map((c) => ({ c, got: classifySession(c) }));

  it('has the breadth the classifier is judged on', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(60);
    const wanted = new Set(CORPUS.map((c) => c.expect));
    for (const role of Object.keys(ROLE_LABELS)) expect(wanted.has(role)).toBe(true);
  });

  it('gets at least 90% of the roles and of the departments right', () => {
    const role = results.filter((r) => r.got.role === r.c.expect).length / results.length;
    const department =
      results.filter(
        (r) => r.got.department === ROLE_LABELS[r.c.expect as keyof typeof ROLE_LABELS].department,
      ).length / results.length;
    expect(role).toBeGreaterThanOrEqual(0.9);
    expect(department).toBeGreaterThanOrEqual(0.9);
  });

  it('is precise for every role: what lands in a role is mostly work of that role', () => {
    for (const role of Object.keys(ROLE_LABELS)) {
      const landed = results.filter((r) => r.got.role === role);
      if (!landed.length) continue;
      const right = landed.filter((r) => r.c.expect === role).length;
      expect(right / landed.length, `precision of ${role}`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('is deterministic', () => {
    expect(CORPUS.map((c) => classifySession(c))).toEqual(results.map((r) => r.got));
  });
});

describe('signals', () => {
  it.each([
    ['修正前端畫面樣式，按鈕對齊', 'frontend'],
    ['資料庫遷移腳本要加上資料表索引', 'data'],
    ['昨晚有事故，監控告警一直響', 'sre'],
    ['Add a REST endpoint for invoices', 'backend'],
  ])('reads %s as %s in either language', (prompt, role) => {
    expect(classifySession({ prompt }).role).toBe(role);
  });

  it('scores tool names, paths, shell commands, delegation and read-only exploration', () => {
    expect(
      classifySession({
        actions: [
          { tool: 'Grep', target: 'src/x.ts' },
          { tool: 'Glob', target: '**/*.ts' },
          { tool: 'Read', target: 'a.ts' },
          { tool: 'LS', target: '.' },
          { tool: 'WebSearch', target: 'q' },
        ],
      }).evidence,
    ).toContain('reads: read-only exploration');
    const delegated = scoreSession({
      actions: [{ tool: 'Task', target: 'code-reviewer' }],
    });
    expect(delegated.byRole.review?.evidence.some((e) => e.startsWith('subagent: delegates'))).toBe(
      true,
    );
    const shell = scoreSession({
      actions: [{ tool: 'Bash', target: 'pnpm vitest run packages/kernel' }],
    });
    expect(
      Object.values(shell.byRole).some((t) => t?.evidence.some((e) => e.startsWith('runs:'))),
    ).toBe(true);
    const doubled = classifySession({
      actions: [
        { tool: 'Edit', target: 'src/ui/A.tsx' },
        { tool: 'Edit', target: 'src/ui/A.tsx' },
      ],
    });
    expect(doubled.evidence.some((e) => e.includes('×2'))).toBe(true);
    expect(classifySession({ actions: [{ tool: 'NotebookRead', target: null }] }).role).toBe(
      'generalist',
    );
  });

  it('weighs what a session did above what it was called', () => {
    const got = classifySession({
      title: 'quick fix',
      actions: Array.from({ length: 4 }, (_, i) => ({
        tool: 'Edit',
        target: `db/migrations/00${i}.sql`,
      })),
    });
    expect(got.role).toBe('data');
    expect(got.evidence[0]).toBe('edits: database files ×4');
  });

  it('reads branch naming conventions', () => {
    expect(classifySession({ branch: 'docs/contributing' }).role).toBe('docs');
    expect(classifySession({ branch: 'chore/ci' }).role).toBe('platform');
  });

  it('treats balanced UI and server work as full-stack', () => {
    const actions = [
      'src/ui/A.tsx',
      'src/ui/B.tsx',
      'src/ui/C.tsx',
      'server/routes/a.ts',
      'server/routes/b.ts',
      'server/routes/c.ts',
    ].map((target) => ({ tool: 'Edit', target }));
    expect(classifySession({ actions }).role).toBe('fullstack');
  });

  it('maps subagent types to roles', () => {
    expect(roleOfSubagent('Explore')).toBe('research');
    expect(roleOfSubagent('Plan')).toBe('architect');
    expect(roleOfSubagent('code-reviewer')).toBe('review');
    expect(roleOfSubagent('security-reviewer')).toBe('security');
    expect(roleOfSubagent('tdd-guide')).toBe('qa');
    expect(roleOfSubagent('general-purpose')).toBeNull();
    expect(classifySession({ subagents: ['security-reviewer'] }).role).toBe('security');
  });

  it('keeps a session with no clear signal a generalist, not a wrong department', () => {
    for (const input of [{}, { prompt: 'hello' }, { title: 'fix it' }, { title: 'bug' }]) {
      expect(classifySession(input)).toMatchObject({ role: 'generalist', department: 'product' });
    }
    expect(classifySession({ prompt: 'update the tests and the docs' }).role).toBe('generalist');
  });

  it('keeps provider and model out of the decision', () => {
    const input = { prompt: 'refactor the module boundaries' };
    expect(classifySession({ ...input, provider: 'codex', model: 'gpt' } as never)).toEqual(
      classifySession(input),
    );
  });

  it('bounds its evidence and never carries more than matched words and labels', () => {
    const secret = 'ghp_' + 'a'.repeat(36);
    const prompt =
      `please fix the api endpoint with token ${secret} and write tests for it `.repeat(5);
    const got = classifySession({
      prompt,
      actions: [{ tool: 'Bash', target: `curl -H "x: ${secret}" localhost` }],
    });
    expect(got.evidence.length).toBeLessThanOrEqual(5);
    for (const e of got.evidence) {
      expect(e.length).toBeLessThanOrEqual(80);
      expect(e).not.toContain(secret);
    }
    resetRoles();
    const out = roleOf('claude:s', { prompt, transcript: [], hook: [] }, 0);
    expect(JSON.stringify(out)).not.toContain(secret);
    expect(JSON.stringify(out)).not.toContain('please fix');
  });
});

describe('stability', () => {
  const as = (prompt: string) => scoreSession({ prompt });
  const frontend = as('polish the css and the react component');
  const backend = as('fix the graphql resolver and the api endpoint');

  it('adopts its first decision at once', () => {
    expect(settle(undefined, frontend, 0).classification.role).toBe('frontend');
  });

  it('does not change department on a single contrary look, nor on looks bunched together', () => {
    let state: Settled = settle(undefined, frontend, 0).state;
    state = settle(state, backend, 20_000).state;
    expect(state.role).toBe('frontend');
    state = settle(state, backend, 21_000).state;
    state = settle(state, backend, 22_000).state;
    expect(state.role).toBe('frontend');
  });

  it('switches after repeated, spaced looks that agree, and not if the old role comes back', () => {
    let state: Settled = settle(undefined, frontend, 0).state;
    for (const at of [20_000, 40_000, 60_000]) state = settle(state, backend, at).state;
    expect(state.role).toBe('backend');
    let held: Settled = settle(undefined, frontend, 0).state;
    held = settle(held, backend, 20_000).state;
    held = settle(held, backend, 40_000).state;
    held = settle(held, frontend, 60_000).state;
    held = settle(held, backend, 80_000).state;
    expect(held.role).toBe('frontend');
  });

  it('shows the held role with its own evidence while a change is pending', () => {
    const state = settle(undefined, frontend, 0).state;
    const out = settle(state, backend, 20_000);
    expect(out.classification.role).toBe('frontend');
    expect(out.classification.evidence.length).toBeGreaterThan(0);
  });

  it('remembers the role per session on the server', () => {
    resetRoles();
    const first = roleOf('claude:a', { prompt: 'polish the css', transcript: [], hook: [] }, 0);
    const later = roleOf(
      'claude:a',
      { prompt: 'fix the api endpoint', transcript: [], hook: [] },
      20_000,
    );
    expect(first.role).toBe('frontend');
    expect(later.role).toBe('frontend');
    expect(
      roleOf('claude:b', { prompt: 'fix the api endpoint', transcript: [], hook: [] }, 20_000).role,
    ).toBe('backend');
  });
});

describe('what a session did, read from its transcript', () => {
  it('reads Claude tool calls and ignores everything else', () => {
    const line = (content: unknown[]) =>
      JSON.stringify({ type: 'assistant', message: { content } });
    const tail = [
      '{"type":"user","message":{"content":"ignored"}}',
      line([
        { type: 'text', text: 'ignored' },
        { type: 'tool_use', name: 'Edit', input: { file_path: 'src/api/a.ts', old_string: 'x' } },
        { type: 'tool_use', name: 'Bash', input: { command: 'vitest run' } },
        { type: 'tool_use', name: 'Task', input: { subagent_type: 'Explore' } },
      ]),
      '{"type":"assistant","message":{"content":[{"type":"tool_use","na',
    ].join('\n');
    expect(claudeActions(tail)).toEqual([
      { tool: 'Edit', target: 'src/api/a.ts' },
      { tool: 'Bash', target: 'vitest run' },
      { tool: 'Task', target: 'Explore' },
    ]);
  });

  it('reads Codex shell calls and the files a patch touches', () => {
    const entry = (payload: unknown) => JSON.stringify({ type: 'response_item', payload });
    const tail = [
      entry({
        type: 'function_call',
        name: 'shell',
        arguments: JSON.stringify({ command: ['bash', '-lc', 'pytest -x'] }),
      }),
      entry({
        type: 'custom_tool_call',
        name: 'apply_patch',
        input: '*** Begin Patch\n*** Update File: tests/test_a.py\n@@\n',
      }),
      entry({ type: 'message', role: 'user' }),
    ].join('\n');
    expect(codexActions(tail)).toEqual([
      { tool: 'exec_command', target: 'bash -lc pytest -x' },
      { tool: 'apply_patch', target: 'tests/test_a.py' },
    ]);
  });

  it('keeps only the latest calls', () => {
    const tail = Array.from({ length: 60 }, (_, i) =>
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `f${i}` } }] },
      }),
    ).join('\n');
    const got = claudeActions(tail);
    expect(got).toHaveLength(40);
    expect(got.at(-1)?.target).toBe('f59');
  });
});

describe('where the result goes', () => {
  it('seats unplaced members on their department floor but never moves a saved desk', () => {
    const agent = { id: 'local:s' } as Agent;
    const saved = mergeLayout(null, [], [agent], () => 0)!;
    const again = mergeLayout(saved, [], [agent], () => 3)!;
    expect(again.objects).toEqual(saved.objects);
    const fresh = mergeLayout(saved, [], [agent, { id: 'local:t' } as Agent], (a) =>
      a.id === 'local:t' ? 3 : 0,
    )!;
    expect(fresh.objects.find((o) => o.agentId === 'local:t')?.floor).toBe(3);
  });

  it('gives a subagent the role its type says and a plain one its parent', () => {
    const session = {
      key: 'claude:s',
      classification: { role: 'backend' },
      subagents: [
        { id: 'a1', type: 'Explore', lastSeen: 0 },
        { id: 'a2', type: 'general-purpose', lastSeen: 0 },
      ],
    } as unknown as LocalSession;
    const roleOfAgent = roleResolver([session]);
    expect(roleOfAgent({ id: 'local:claude:s' } as Agent)).toBe('backend');
    expect(roleOfAgent({ id: 'local:claude:s:sub:a1' } as Agent)).toBe('research');
    expect(roleOfAgent({ id: 'local:claude:s:sub:a2' } as Agent)).toBe('backend');
  });

  it('explains the role in both languages', () => {
    const c = {
      confidence: 0.82,
      evidence: ['edits: server code ×4', 'runs: test runs', 'branch: api', 'repo: x'],
    };
    expect(roleWhy(c, (k) => translate('en', k))).toBe(
      '82% · because: edits server code ×4; runs test runs; branch api',
    );
    expect(roleWhy(c, (k) => translate('zh-TW', k))).toContain('依據: 修改 server code ×4');
    expect(
      roleWhy({ confidence: 0, evidence: ['no clear signal'] }, (k) => translate('en', k)),
    ).toContain('no clear signal');
  });
});

// The classifier must stay a pure heuristic over data already on disk or in memory: it never asks a model, never touches
// the network and never starts claude or codex. This reads the source of the classifier and of everything it imports.
describe('no model, no network', () => {
  const FORBIDDEN =
    /from ['"](?:node:)?(?:child_process|http|https|http2|net|tls|dgram|dns|worker_threads)['"]|from ['"](?:@anthropic-ai|@openai|openai|@google|@aether\/providers|undici|node-fetch|axios|ws)[^'"]*['"]|\bfetch\(|\bXMLHttpRequest\b|\bspawn\(|\bexecFile\(|\bexec\(|\bWebSocket\b|claude -p|codex exec/;
  const ENTRY = [
    'packages/kernel/src/classify-session.ts',
    'packages/kernel/src/role-signals.ts',
    'apps/control/src/services/sessions/session-work.ts',
    'apps/control/src/services/sessions/session-role.ts',
  ].map((p) => resolve(__dirname, '../..', p));

  const modulesOf = (entry: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    for (const m of readFileSync(entry, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      seen.add(resolve(dirname(entry), m[1]!.replace(/\.js$/, '.ts')));
      modulesOf(resolve(dirname(entry), m[1]!.replace(/\.js$/, '.ts')), seen);
    }
    return seen;
  };

  it('imports nothing that could reach a model or the network', () => {
    const files = new Set(ENTRY.flatMap((e) => [...modulesOf(e)]));
    expect(files.size).toBeGreaterThanOrEqual(ENTRY.length);
    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      expect(FORBIDDEN.test(source), `${file} must not reach a model or the network`).toBe(false);
    }
  });
});

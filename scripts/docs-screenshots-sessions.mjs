import { MIN, NOW, iso } from './docs-screenshots-clock.mjs';

let toolN = 0;
const user = (cwd, text, ago) => ({
  type: 'user',
  cwd,
  timestamp: iso(ago),
  message: { role: 'user', content: text },
});
const say = (
  cwd,
  text,
  ago,
  usage = { input_tokens: 4200, cache_read_input_tokens: 61000, output_tokens: 700 },
) => ({
  type: 'assistant',
  cwd,
  timestamp: iso(ago),
  message: {
    role: 'assistant',
    model: 'claude-opus-5-5',
    usage,
    content: [{ type: 'text', text }],
  },
});
export const tool = (cwd, name, input, ago, result = 'ok') => {
  const id = `toolu_${(toolN += 1)}`;
  const lines = [
    {
      type: 'assistant',
      cwd,
      timestamp: iso(ago),
      message: {
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'tool_use', id, name, input }],
      },
    },
  ];
  if (result !== null)
    lines.push({
      type: 'user',
      cwd,
      timestamp: iso(ago - 2000),
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: id, content: result, is_error: false }],
      },
    });
  return lines;
};
const hook = (event, ago, sessionId, cwd, extra = {}) => ({
  at: NOW - ago,
  provider: 'claude',
  event,
  sessionId,
  cwd,
  ...extra,
});

export const SESSIONS = [
  {
    repo: 'harbor-web',
    branch: 'feat/checkout-redesign',
    id: 'c0ffee01-0001-4000-8000-000000000001',
    title: 'Checkout page redesign',
    agoMs: 15_000,
    commits: 60,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 8 * MIN, id, cwd),
      hook('PreToolUse', 20_000, id, cwd, { tool: 'Edit', target: 'CheckoutForm.tsx' }),
      ...[
        ['sub-a', 'Explore', 'Read'],
        ['sub-b', 'Explore', 'Grep'],
        ['sub-c', 'code-reviewer', 'Read'],
      ].flatMap(([agentId, agentType, toolName], i) => [
        hook('SubagentStart', 4 * MIN - i * 20_000, id, cwd, { agentId, agentType }),
        hook('PreToolUse', 30_000 + i * 5_000, id, cwd, {
          agentId,
          agentType,
          tool: toolName,
          target: 'Cart.tsx',
        }),
        hook('PreToolUse', 12_000 + i * 3_000, id, cwd, {
          agentId,
          agentType,
          tool: 'Read',
          target: 'api.ts',
        }),
      ]),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Checkout page redesign' },
      user(
        cwd,
        'Redesign the checkout page: one column on a phone, the order summary sticky on desktop, and keep the cart in the URL.',
        40 * MIN,
      ),
      say(cwd, 'I will start with the layout and keep the form logic untouched.', 39 * MIN),
      ...tool(cwd, 'Read', { file_path: `${cwd}/src/pages/Checkout.tsx` }, 38 * MIN),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/pages/Checkout.tsx` }, 36 * MIN),
      say(
        cwd,
        'The layout is in. The summary is `position: sticky` from 960 px up and folds under the form below that.',
        35 * MIN,
      ),
      user(
        cwd,
        'Good. Now the form: inline validation, the card field masked, and a clear error summary for screen readers.',
        8 * MIN,
      ),
      {
        type: 'user',
        cwd,
        timestamp: iso(7.9 * MIN),
        message: {
          role: 'user',
          content: '<system-reminder>The task tools have not been used recently.</system-reminder>',
        },
      },
      say(
        cwd,
        'On it. Plan:\n\n- validate on blur, not on every key\n- mask the card number with a formatter\n- add an `aria-live` error summary\n\nFirst I read what exists.',
        7.5 * MIN,
      ),
      ...tool(cwd, 'Read', { file_path: `${cwd}/src/components/CardField.tsx` }, 7 * MIN),
      ...tool(cwd, 'Grep', { pattern: 'aria-invalid', path: `${cwd}/src` }, 6.5 * MIN),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/components/CardField.tsx` }, 5 * MIN),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/components/ErrorSummary.tsx` }, 4 * MIN),
      ...tool(cwd, 'Bash', { command: 'pnpm vitest run src/components' }, 3 * MIN, '12 passed'),
      say(
        cwd,
        'The form is done and the tests are green:\n\n- errors show on blur and are announced once\n- the card number is masked while typing\n\n```ts\nconst masked = formatCard(value);\n```\n\n| Check | Result |\n| --- | --- |\n| Unit tests | 12 passed |\n| Typecheck | running |\n\nNow the summary at the top of the form.',
        2 * MIN,
      ),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/styles/checkout.css` }, 1 * MIN),
      ...tool(cwd, 'Bash', { command: 'pnpm typecheck' }, 20_000, null),
    ],
  },
  {
    repo: 'ledger-api',
    branch: 'fix/webhook-retry',
    id: 'c0ffee02-0002-4000-8000-000000000002',
    title: 'Fix webhook retry storm',
    agoMs: 3 * MIN,
    commits: 40,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 9 * MIN, id, cwd),
      hook('PermissionRequest', 3 * MIN, id, cwd, { tool: 'Bash', target: 'pnpm' }),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Fix webhook retry storm' },
      user(
        cwd,
        'The provider answers 429 and we retry in a tight loop. Add exponential backoff with jitter.',
        10 * MIN,
      ),
      ...tool(cwd, 'Read', { file_path: `${cwd}/src/webhooks/retry.ts` }, 9 * MIN),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/webhooks/retry.ts` }, 6 * MIN),
      say(
        cwd,
        'Backoff with full jitter is in `retry.ts`. To confirm the 429 path I need to run the integration suite against the sandbox database. May I run `pnpm test:integration`?',
        3 * MIN,
      ),
    ],
  },
  {
    repo: 'docs-site',
    branch: 'main',
    id: 'c0ffee03-0003-4000-8000-000000000003',
    title: 'Changelog for 2.4',
    agoMs: 4 * MIN,
    commits: 25,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 12 * MIN, id, cwd),
      hook('Stop', 4 * MIN, id, cwd),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Changelog for 2.4' },
      user(
        cwd,
        'Write the 2.4 changelog from the merged pull requests and link the migration guide.',
        12 * MIN,
      ),
      ...tool(
        cwd,
        'Bash',
        { command: 'gh pr list --state merged --limit 30' },
        11 * MIN,
        '30 pull requests',
      ),
      ...tool(cwd, 'Write', { file_path: `${cwd}/docs/changelog/2.4.md` }, 6 * MIN),
      say(
        cwd,
        'Done: `docs/changelog/2.4.md` lists 18 user-facing changes in three groups, each linked to its pull request, with the migration guide at the top.',
        4 * MIN,
      ),
    ],
  },
  {
    repo: 'mobile-app',
    branch: 'perf/cold-start',
    id: 'c0ffee04-0004-4000-8000-000000000004',
    title: null,
    agoMs: 40_000,
    commits: 30,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 50_000, id, cwd),
      hook('PreToolUse', 30_000, id, cwd, { tool: 'Bash', target: 'adb', tags: ['test'] }),
    ],
    build: (cwd) => [
      user(cwd, 'Profile the Android cold start and tell me the three biggest costs.', 50_000),
    ],
  },
  {
    repo: 'data-pipeline',
    branch: 'feat/dedupe-events',
    id: 'c0ffee05-0005-4000-8000-000000000005',
    title: 'Deduplicate the event stream',
    agoMs: 25_000,
    commits: 35,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 6 * MIN, id, cwd),
      hook('PreToolUse', 25_000, id, cwd, { tool: 'Bash', target: 'pytest', tags: ['test'] }),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Deduplicate the event stream' },
      user(
        cwd,
        'Events arrive twice after a consumer restart. Make the sink idempotent on the event id.',
        6 * MIN,
      ),
      ...tool(cwd, 'Read', { file_path: `${cwd}/pipeline/sink.py` }, 5 * MIN),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/pipeline/sink.py` }, 3 * MIN),
      ...tool(cwd, 'Bash', { command: 'pytest tests/test_sink.py' }, 25_000, null),
    ],
  },
  {
    repo: 'design-system',
    branch: 'feat/tokens-v2',
    id: 'c0ffee06-0006-4000-8000-000000000006',
    title: 'Spacing tokens v2',
    agoMs: 50_000,
    commits: 30,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 5 * MIN, id, cwd),
      hook('PreToolUse', 50_000, id, cwd, { tool: 'Edit', target: 'tokens.css' }),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Spacing tokens v2' },
      user(
        cwd,
        'Replace the ad-hoc paddings in the button and card components with the new spacing tokens.',
        5 * MIN,
      ),
      ...tool(cwd, 'Edit', { file_path: `${cwd}/src/tokens.css` }, 50_000),
    ],
  },
  {
    repo: 'infra',
    branch: 'chore/terraform-bump',
    id: 'c0ffee07-0007-4000-8000-000000000007',
    title: 'Bump terraform providers',
    agoMs: 3 * 60 * MIN,
    commits: 20,
    hooks: (id, cwd) => [
      hook('UserPromptSubmit', 190 * MIN, id, cwd),
      hook('Stop', 180 * MIN, id, cwd),
    ],
    build: (cwd) => [
      { type: 'ai-title', aiTitle: 'Bump terraform providers' },
      user(cwd, 'Bump the aws provider to 6.x and check the plan is clean.', 190 * MIN),
      say(cwd, 'Provider bumped to 6.2; `terraform plan` shows no changes.', 180 * MIN),
    ],
  },
];

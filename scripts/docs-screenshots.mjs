// Documentation screenshots: starts a throwaway demo stack on synthetic data and photographs it with Playwright.
//
//   node --import tsx scripts/docs-screenshots.mjs --port 4511 --out docs/images [--only id,id] [--list] [--gpu] [--hold]
//
// Everything on screen comes from a fixture home built here: invented repositories, authors and conversations, fake
// `claude` processes (`sleep`, named claude, standing in each repository) and hook records. Nothing is read from your
// ~/.claude or ~/.codex, no model is called, and the stack and its data directory are removed afterwards. Only the PIDs this
// script started are signalled. The LAN address in the pairing QR code is a stand-in (`192.168.1.20`).
// `--gpu` uses the real GPU (ANGLE Metal); without it Chrome renders in software, which is slower but identical in content.
// `--hold` keeps the stack up after the shots (Ctrl+C to stop) so a page can be looked at by hand.
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  claudeLine,
  codexContext,
  codexCount,
  codexMeta,
  writeLines,
} from '../tests/aether/usage-fixtures.ts';
import { setup } from './setup.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const next = process.argv[at + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};
const port = Number(flag('port') ?? 4511);
const out = resolve(String(flag('out') ?? join(root, 'docs/images')));
const only = typeof flag('only') === 'string' ? String(flag('only')).split(',') : null;
const MAX_BYTES = 250 * 1024;
const LAN = '192.168.1.20';

// ---- the fixture: a home with repositories, transcripts, hook records and stand-in processes -----------------------------
const work = realpathSync(mkdtempSync(join(tmpdir(), 'aether-docs-')));
const home = join(work, 'home');
const data = join(work, 'data');
const spool = join(home, 'hook-events.jsonl');
const pids = [];
const NOW = Date.now();
const MIN = 60_000;
const DAY = 86_400_000;
const iso = (agoMs) => new Date(NOW - agoMs).toISOString();

const git = (cwd, args, date) =>
  execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.name=Ada Lin', '-c', 'user.email=ada@example.invalid', ...args],
    {
      env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
      stdio: 'ignore',
    },
  );

/** A repository with a believable history: a trunk, three feature branches merged, one still open. */
function repository(name, branch, commits) {
  const cwd = join(home, 'repos', name);
  mkdirSync(cwd, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', cwd]);
  let n = 0;
  const commit = (subject, agoDays) => {
    n += 1;
    writeFileSync(join(cwd, `file-${n}.txt`), `${n}\n`); // one file per commit, so a merge never conflicts
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', subject], new Date(NOW - agoDays * DAY).toISOString());
  };
  const per = Math.max(1, Math.floor(commits / 5));
  for (let i = 0; i < per; i += 1) commit(`Trunk work ${i + 1}`, 40 - i * 2);
  for (const [feature, started] of [
    ['feat/search', 30],
    ['fix/retry', 20],
    ['feat/export', 10],
  ]) {
    git(cwd, ['checkout', '-q', '-b', feature]);
    for (let i = 0; i < per; i += 1) commit(`${feature}: step ${i + 1}`, started - i);
    git(cwd, ['checkout', '-q', 'main']);
    commit(`Trunk during ${feature}`, started - per);
    git(
      cwd,
      ['merge', '-q', '--no-ff', '-m', `Merge ${feature}`, feature],
      new Date(NOW - (started - per - 1) * DAY).toISOString(),
    );
  }
  if (branch !== 'main') git(cwd, ['checkout', '-q', '-b', branch]);
  for (let i = 0; i < per; i += 1) commit(`${branch}: step ${i + 1}`, 2 - i * 0.2);
  return cwd;
}

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
const tool = (cwd, name, input, ago, result = 'ok') => {
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

const SESSIONS = [
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
      // Three subagents: two exploring, one reviewing; their hook records keep them "running" for the whole run.
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

function buildFixture() {
  mkdirSync(join(home, '.aether'), { recursive: true });
  writeFileSync(spool, '');
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5'];
  for (const s of SESSIONS) {
    const cwd = repository(s.repo, s.branch, s.commits);
    const dir = join(home, '.claude/projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${s.id}.jsonl`);
    // A week of earlier usage (for the KPI dashboard) before the conversation itself.
    const history = [];
    for (let d = 6; d >= 1; d -= 1)
      for (let k = 0; k < 3; k += 1)
        history.push(
          claudeLine(
            `msg_${s.repo}_${d}_${k}`,
            iso(d * DAY - k * 40 * MIN),
            {
              i: 1500 + ((d * 977 + k * 313) % 2400),
              cw: 600,
              cr: Math.round((30_000 + d * 4_000 + k * 6_000) * (0.4 + SESSIONS.indexOf(s) * 0.35)),
              o: 500 + ((d * 211 + k * 97) % 1200),
            },
            { model: models[(d + k) % 3], cwd },
          ),
        );
    writeFileSync(
      file,
      s
        .build(cwd)
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n',
    );
    const earlier = join(dir, `earlier-${s.id}.jsonl`); // finished sessions of the week: only the KPI numbers read them
    writeLines(earlier, history);
    utimesSync(earlier, new Date(NOW - 1 * DAY), new Date(NOW - 1 * DAY));
    const at = new Date(NOW - s.agoMs);
    utimesSync(file, at, at);
    for (const record of s.hooks(s.id, cwd)) appendFileSync(spool, JSON.stringify(record) + '\n');
    // `sleep` named claude, standing in the repository: the scanner finds the process by name and working directory.
    const child = spawn('bash', ['-c', 'exec -a claude sleep 86400'], {
      cwd,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    pids.push(child.pid);
  }
  // Claude's subscription windows and one Codex rollout with its own, so the KPI dashboard has both rings.
  writeFileSync(
    join(home, 'claude-hud-usage.json'),
    JSON.stringify({
      timestamp: NOW,
      data: {
        planName: 'Max',
        fiveHour: 31,
        sevenDay: 58,
        fiveHourResetAt: new Date(NOW + 2 * 3_600_000).toISOString(),
        sevenDayResetAt: new Date(NOW + 3 * DAY).toISOString(),
      },
    }),
  );
  const day = new Date(NOW).toISOString().slice(0, 10).replaceAll('-', '/');
  const rollout = join(
    home,
    '.codex/sessions',
    day,
    'rollout-docs-019d0000-0000-7000-8000-0000000000aa.jsonl',
  );
  const repoPath = join(home, 'repos', 'ledger-api');
  const resets = Math.floor(NOW / 1000) + 3 * 3600;
  writeLines(rollout, [
    codexMeta(iso(40 * MIN), repoPath),
    codexContext(iso(39 * MIN), 'gpt-5.5'),
    codexCount(
      iso(30 * MIN),
      { input: 120_000, cached: 90_000, output: 9_000, reasoning: 3_000 },
      { input: 40_000, cached: 30_000, output: 3_000, reasoning: 1_000 },
      true,
    )
      .replace(/"resets_at":4000000000/g, `"resets_at":${resets}`)
      .replace(/"resets_at":4000100000/g, `"resets_at":${resets + 4 * 86400}`),
  ]);
  const old = new Date(NOW - 30 * MIN);
  utimesSync(rollout, old, old);
}

// ---- the stack -----------------------------------------------------------------------------------------------------------
function startStack() {
  setup('demo', data);
  const env = {
    ...process.env,
    PORT: String(port),
    AETHER_MODE: 'demo',
    AETHER_DATA_DIR: data,
    AETHER_CONTROL_URL: `http://127.0.0.1:${port}`,
    AETHER_LOCAL_SESSIONS_HOME: home,
    AETHER_HOOK_SPOOL: spool,
    AETHER_APPROVALS_CONFIG: join(home, '.aether/approvals.json'),
    AETHER_CLAUDE_HOME: join(home, '.claude'),
    AETHER_CODEX_HOME: join(home, '.codex'),
    AETHER_CLAUDE_USAGE_FILE: join(home, 'claude-hud-usage.json'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    CODEX_HOME: join(home, '.codex'),
    AETHER_E2E_LAN_ADDRESSES: LAN,
  };
  for (const name of ['control', 'runner']) {
    const child = spawn(process.execPath, [join(root, `apps/${name}/dist/main.js`)], {
      cwd: root,
      env,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    pids.push(child.pid);
  }
}
async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the control plane did not start');
}
function stopStack() {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  rmSync(work, { recursive: true, force: true });
}

// ---- the shots ----------------------------------------------------------------------------------------------------------
const base = `http://127.0.0.1:${port}`;
const token = () => readFileSync(join(data, 'owner-token'), 'utf8').trim();
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** A browser context already holding the preferences a person would have, signed in. */
async function open(
  browser,
  {
    size = DESKTOP,
    theme = 'dark',
    locale = 'en',
    url = '/office',
    prefs = {},
    touch = false,
    project = 'harbor-web',
  } = {},
) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    permissions: [],
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([t, l, extra]) => {
      localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: { theme: t, locale: l, view: '3d', autoCamera: false, ...extra },
          version: 0,
        }),
      );
      localStorage.setItem('aether-building-panel', 'closed');
    },
    [theme, locale, prefs],
  );
  await page.goto(`${base}${url}`);
  await page.getByLabel(/access token|存取權杖/i).fill(token());
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await page
    .locator(url.startsWith('/office') ? 'canvas' : 'main')
    .first()
    .waitFor({ timeout: 60_000 });
  if (project) {
    // The repositories of the fixture sessions are adopted as projects a moment after sign-in.
    const picker = page.locator('.project-picker select');
    await picker
      .locator('option', { hasText: project })
      .waitFor({ state: 'attached', timeout: 60_000 });
    await picker.selectOption({ label: project });
  }
  return { context, page };
}

/** Saves a JPEG, lowering the quality until it is small enough. */
async function save(page, id, options = {}) {
  mkdirSync(out, { recursive: true });
  const path = join(out, `${id}.jpg`);
  for (const quality of [82, 74, 66, 58, 50]) {
    await page.screenshot({ path, type: 'jpeg', quality, ...options });
    if (statSync(path).size <= MAX_BYTES) break;
  }
  console.log(`${id}.jpg  ${(statSync(path).size / 1024).toFixed(0)} KB`);
}

const settle = (page, ms = 6000) => page.waitForTimeout(ms);
const feedRow = (page, text) => page.locator('.feed-row', { hasText: text }).first();

/** The first-visit tour is the one place the whole spire and its crown are in frame; its caption is left out of the picture. */
const tour =
  (id, seconds, theme = 'dark') =>
  async (browser) => {
    const { context, page } = await open(browser, { url: '/office?intro=force', theme });
    await page.addStyleTag({ content: '.intro-caption{display:none!important}' });
    await page.waitForTimeout(seconds * 1000);
    await save(page, id);
    await context.close();
  };

const SHOTS = {
  // The orbit at about 9 s shows the building, the spire and the crown at once; the rise at 43 s is the crown close up.
  'office-overview-desktop': tour('office-overview-desktop', 9),
  'office-overview-desktop-light': tour('office-overview-desktop-light', 9, 'light'),
  'office-crown-desktop': tour('office-crown-desktop', 43),
  'session-conversation-desktop': async (browser) => {
    const { context, page } = await open(browser);
    await settle(page, 4000);
    await feedRow(page, 'Checkout page redesign').click();
    await settle(page, 5000);
    await save(page, 'session-conversation-desktop');
    await context.close();
  },
};

SHOTS['kpi-dashboard-desktop'] = async (browser) => {
  const { context, page } = await open(browser);
  await settle(page, 8000);
  await page.getByRole('button', { name: 'Open the KPI dashboard' }).click();
  await settle(page, 2500);
  await save(page, 'kpi-dashboard-desktop');
  await context.close();
};
SHOTS['squad-strings-desktop'] = async (browser) => {
  const { context, page } = await open(browser, {
    url: '/office?squad=4&tools=900&look=1',
    prefs: { panelCollapsed: true },
  });
  await settle(page, 7000);
  await save(page, 'squad-strings-desktop');
  await context.close();
};
SHOTS['settings-office-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { url: '/settings/office' });
  await settle(page, 2000);
  await save(page, 'settings-office-desktop');
  await context.close();
};
SHOTS['character-menu-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { prefs: { panelCollapsed: false } });
  await settle(page, 4000);
  await feedRow(page, 'Deduplicate the event stream').click();
  const tag = page.locator('button.scene-label.selected');
  await tag.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(3000);
  await tag.click(); // the feed row chose it; a second click on its name tag opens the menu
  await page.locator('.char-menu').waitFor({ timeout: 10_000 });
  await save(page, 'character-menu-desktop');
  await context.close();
};
SHOTS['connect-phone-desktop'] = async (browser) => {
  const { context, page } = await open(browser);
  await settle(page, 3000);
  await page.getByRole('button', { name: 'Open on your phone' }).first().click();
  await settle(page, 2500);
  await save(page, 'connect-phone-desktop');
  await context.close();
};
SHOTS['approval-card-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { project: 'ledger-api' }); // opening the project adopts its repository
  // What switching it on in Settings does, as the owner: a cookie session and its CSRF token, then PUT /api/remote-approvals.
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ token: token() }),
  });
  const { csrf } = await login.json();
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const on = await fetch(`${base}/api/remote-approvals`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: base, cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ enabled: true }),
  });
  if (!on.ok) throw new Error(`remote approvals not enabled: ${on.status}`);
  const hookToken = JSON.parse(readFileSync(join(home, '.aether/approvals.json'), 'utf8')).token;
  const id = 'c0ffee02-0002-4000-8000-000000000002';
  const posted = await fetch(`${base}/api/hook/permission-requests`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: id,
      cwd: join(home, 'repos/ledger-api'),
      tool: 'Bash',
      waitMs: 600_000,
      nonce: 'docsnonce0123456789',
      input: {
        command: 'pnpm test:integration',
        description: 'Run the integration suite against the sandbox database',
      },
      rules: ['Bash(pnpm test:integration:*)'],
    }),
  });
  if (!posted.ok) throw new Error(`permission request refused: ${posted.status}`);
  await settle(page, 6000);
  await save(page, 'approval-card-desktop');
  await context.close();
};
SHOTS['office-phone'] = async (browser) => {
  const { context, page } = await open(browser, { size: PHONE, touch: true });
  await settle(page, 9000);
  await save(page, 'office-phone');
  await context.close();
};
SHOTS['sessions-phone'] = async (browser) => {
  const { context, page } = await open(browser, { size: PHONE, touch: true });
  await settle(page, 6000);
  await page.touchscreen.tap(359, 735); // the chevron of the peek bar opens the sheet
  await settle(page, 2000);
  await save(page, 'sessions-phone');
  await page.getByText('Checkout page redesign').first().tap();
  await settle(page, 3000);
  await save(page, 'conversation-phone');
  await context.close();
};
const wanted = Object.keys(SHOTS).filter((id) => !only || only.includes(id));
if (flag('list')) {
  console.log(Object.keys(SHOTS).join('\n'));
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopStack();
    process.exit(1);
  });
let browser;
try {
  buildFixture();
  startStack();
  await waitForHealth();
  browser = await chromium.launch({
    channel: 'chrome',
    args: flag('gpu') ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
  });
  for (const id of wanted) await SHOTS[id](browser);
  if (flag('hold')) {
    console.log(`stack on ${base}, owner token in ${join(data, 'owner-token')} (Ctrl+C to stop)`);
    await new Promise(() => {});
  }
} finally {
  await browser?.close();
  stopStack();
}

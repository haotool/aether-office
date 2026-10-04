/**
 * Live smoke: two real agents, Claude Code and Codex, talk to each other through AETHER's durable messages.
 *
 * It runs the installed CLIs under the logins already on this machine (a Claude.ai subscription and a ChatGPT login):
 * no API key is read, written or required, and the runner is only handed the variables listed in apps/runner/src/native.ts.
 * It uses a few turns of subscription quota, so it does nothing unless asked:
 *
 *   tsx scripts/live-smoke.ts --confirm-subscription-quota [--only claude|codex|exchange]
 *
 * Everything happens in a throwaway directory and a throwaway Git repository. Tool approvals are decided here by an
 * explicit allow-list: the AETHER collaboration tools are allowed, anything else is denied.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Control } from '../apps/control/src/control.js';
import { setup } from './setup.js';

const flag = (name: string) => process.argv.includes(name);
const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
if (!flag('--confirm-subscription-quota')) {
  console.error(
    'This starts real Claude Code and Codex sessions under your logged-in subscriptions and uses a little quota.\nRe-run with --confirm-subscription-quota to proceed.',
  );
  process.exit(2);
}
const only = option('--only') ?? 'exchange';
const PORT = Number(option('--port') ?? 4581);
const base = `http://127.0.0.1:${PORT}`;
const codexBinary =
  option('--codex') ?? execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const claudeBinary =
  option('--claude') ?? execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();

const directory = mkdtempSync(join(tmpdir(), 'aether-live-smoke-'));
const repository = join(directory, 'repo');
execFileSync('git', ['init', '-q', repository]);
writeFileSync(join(repository, 'README.md'), 'smoke\n');
execFileSync('git', ['-C', repository, 'add', '.']);
execFileSync('git', [
  '-C',
  repository,
  '-c',
  'user.name=Smoke',
  '-c',
  'user.email=smoke@example.invalid',
  'commit',
  '-qm',
  'base',
]);
const root = realpathSync(repository);

setup('live', directory);
const token = readFileSync(join(directory, 'owner-token'), 'utf8').trim();
const native = join(directory, 'native.json');
writeFileSync(
  native,
  JSON.stringify({
    enabled: true,
    repositories: [root],
    binaries: { codex: codexBinary, claude: claudeBinary },
  }),
  { mode: 0o600 },
);
// Seed the project, the two agents and the execution policy before the processes start, so the runner token covers the project.
const seeded = (() => {
  const control = new Control(join(directory, 'control.sqlite'), { mode: 'live' });
  try {
    const owner = control.authenticate(token);
    const run = (type: string, data: unknown, projectId?: string, expectedVersion?: number) =>
      control.execute(owner, {
        schemaVersion: 1,
        type,
        data,
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        ...(projectId ? { projectId } : {}),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      });
    const projectId = String(run('project.create', { name: 'Live smoke', root }).result['id']);
    const agent = (name: string, provider: 'claude' | 'codex', species: string) =>
      String(
        run(
          'agent.register',
          { name, provider, role: 'Engineer', species, color: '#4be3dc' },
          projectId,
        ).result['id'],
      );
    const claudeId = agent('Claude Smoke', 'claude', 'fox');
    const codexId = agent('Codex Smoke', 'codex', 'cat');
    run(
      'project.execution.configure',
      { liveEnabled: true, maxTurns: 10, timeoutMs: 300000 },
      projectId,
      0,
    );
    return { projectId, claudeId, codexId };
  } finally {
    control.close();
  }
})();
setup('live', directory); // now the runner token is scoped to the project

const env = {
  ...process.env,
  PORT: String(PORT),
  AETHER_MODE: 'live',
  AETHER_DATA_DIR: directory,
  AETHER_CONTROL_URL: base,
  AETHER_NATIVE_CONFIG: native,
};
const children: ChildProcess[] = [];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', () => {
  stop();
  process.exit(130);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cookie = '';
let csrf = '';
async function http(method: 'GET' | 'POST', path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      host: `127.0.0.1:${PORT}`,
      cookie,
      'x-csrf-token': csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as any) : {};
}
const command = (type: string, data: unknown, projectId?: string, expectedVersion?: number) =>
  http('POST', '/api/commands', {
    schemaVersion: 1,
    type,
    data,
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    ...(projectId ? { projectId } : {}),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  });

const log = (message: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const timeline: string[] = [];
const note = (message: string) => {
  timeline.push(message);
  log(message);
};

async function main() {
  for (const name of ['control', 'runner'])
    children.push(
      spawn(process.execPath, [`apps/${name}/dist/main.js`], {
        env,
        stdio: ['ignore', 'ignore', 'inherit'],
      }),
    );
  for (let i = 0; i < 80; i++) {
    if (
      await fetch(`${base}/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await sleep(250);
  }
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${PORT}` },
    body: JSON.stringify({ token }),
  });
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  csrf = ((await login.json()) as { csrf: string }).csrf;

  const { projectId, claudeId, codexId } = seeded;
  note(
    `project and two agents created (claude ${claudeId.slice(0, 8)}, codex ${codexId.slice(0, 8)})`,
  );

  const nonceA = `A-${randomUUID().slice(0, 8)}`;
  const nonceB = `B-${randomUUID().slice(0, 8)}`;
  const create = async (title: string, description: string, acceptance: string) =>
    String(
      (await command('work.create', { title, description, acceptance, priority: 1 }, projectId))
        .result.id,
    );
  const assign = async (workId: string, agentId: string) => {
    const snapshot = await http('GET', `/api/projects/${projectId}/snapshot`);
    const work = snapshot.work.find((w: { id: string }) => w.id === workId);
    await command('work.assign', { workId, agentId }, projectId, work.version);
  };

  const works: { id: string; label: string }[] = [];
  if (only === 'exchange') {
    const codexWork = await create(
      'Answer the message from Claude',
      `You are "Codex Smoke". Do not edit files or run shell commands. Use only the aether MCP tools.\n1. Call wait_for_message (timeoutMs 25000) until a message arrives; repeat up to 6 times.\n2. The message contains a nonce starting with "A-". Reply with send_message to the sender (recipients: use the sender id from the message) with replyTo set to that message id and a body that contains exactly the text "${nonceB}" and the nonce you received.\n3. Then ack_message the received message and finish with a one-line summary.`,
      `A reply containing ${nonceB} and the received nonce was sent.`,
    );
    const claudeWork = await create(
      'Exchange nonces with Codex',
      `You are "Claude Smoke". Do not edit files or run shell commands. Use only the aether MCP tools.\n1. Call send_message to recipient ${codexId} with kind "request" and a body containing exactly the text "${nonceA}".\n2. Then call wait_for_message (timeoutMs 25000) until a reply arrives; repeat up to 8 times.\n3. Finish with a one-line summary that quotes the reply text.`,
      `A reply containing ${nonceB} was received.`,
    );
    await assign(codexWork, codexId);
    works.push({ id: codexWork, label: 'codex' });
    await sleep(4000);
    await assign(claudeWork, claudeId);
    works.push({ id: claudeWork, label: 'claude' });
  } else {
    const provider = only === 'claude' ? claudeId : codexId;
    const id = await create(
      'Report your identity',
      'Do not edit files or run shell commands. Call the aether MCP tool whoami once, then finish with one line that states your agentId.',
      'The summary contains the agentId.',
    );
    await assign(id, provider);
    works.push({ id, label: only });
  }

  const decided = new Set<string>();
  const seen = new Map<string, string>();
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const approvals = (await http('GET', `/api/projects/${projectId}/approvals`)) as {
      id: string;
      state: string;
      kind: string;
      toolId: string;
      version: number;
      actionHash: string;
      parameters: string;
    }[];
    for (const a of approvals.filter((x) => x.state === 'pending' && !decided.has(x.id))) {
      // Only the AETHER collaboration tools, named by the provider (Claude: mcp__aether__*); never a command or a file change.
      const allowed =
        a.kind.startsWith('mcp__aether__') ||
        (a.kind === 'mcpToolCall' && String(a.parameters).includes('"serverName":"aether"'));
      decided.add(a.id);
      await command(
        'approval.decide',
        { approvalId: a.id, actionHash: a.actionHash, decision: allowed ? 'approve' : 'deny' },
        projectId,
        a.version,
      );
      note(
        `approval ${a.kind} (${a.toolId.slice(0, 24)}) → ${allowed ? 'approved: aether tool' : 'denied: not an aether tool'}`,
      );
    }
    const snapshot = await http('GET', `/api/projects/${projectId}/snapshot`);
    for (const w of works) {
      const row = snapshot.work.find((x: { id: string }) => x.id === w.id);
      if (row && seen.get(w.id) !== row.state) {
        seen.set(w.id, row.state);
        note(`${w.label} work → ${row.state}`);
      }
    }
    if (
      works.every((w) =>
        ['submitted', 'reviewing', 'completed', 'failed', 'cancelled', 'indeterminate'].includes(
          seen.get(w.id) ?? '',
        ),
      )
    )
      break;
    await sleep(2000);
  }

  const snapshot = await http('GET', `/api/projects/${projectId}/snapshot`);
  const messages = snapshot.messages as {
    id: string;
    senderId: string;
    kind: string;
    body: string;
    deliveries: { state: string }[];
  }[];
  const result = {
    only,
    works: works.map((w) => {
      const row = snapshot.work.find((x: { id: string }) => x.id === w.id);
      return {
        provider: w.label,
        state: row?.state,
        result: String(row?.result ?? '').slice(0, 300),
      };
    }),
    messages: messages.map((m) => ({
      from: m.senderId === claudeId ? 'claude' : m.senderId === codexId ? 'codex' : 'other',
      kind: m.kind,
      carriesNonceA: m.body.includes(nonceA),
      carriesNonceB: m.body.includes(nonceB),
      deliveries: m.deliveries.map((d) => d.state),
    })),
    exchangeProven:
      only === 'exchange' &&
      messages.some((m) => m.senderId === claudeId && m.body.includes(nonceA)) &&
      messages.some(
        (m) => m.senderId === codexId && m.body.includes(nonceB) && m.body.includes(nonceA),
      ),
    timeline,
  };
  mkdirSync('evidence', { recursive: true });
  const file = `evidence/live-smoke-${only}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  log(`evidence written to ${file}`);
  console.log(
    JSON.stringify(
      { exchangeProven: result.exchangeProven, works: result.works, messages: result.messages },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(stop);

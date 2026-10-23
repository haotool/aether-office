import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim();
if (dirty) console.warn('warning: uncommitted changes are NOT part of the clone being verified');

const work = mkdtempSync(join(tmpdir(), 'aether-clean-room-'));
const repo = join(work, 'repo');
const [pnpmCmd, ...pnpmArgs] = (process.env['PNPM'] ?? 'pnpm').split(' ');
const results = [];

function step(name, command, args, options = {}) {
  const started = Date.now();
  const run = spawnSync(command, args, {
    cwd: options.cwd ?? repo,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    timeout: options.timeout ?? 600000,
  });
  const ok = run.status === 0;
  results.push({ name, ok, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`${ok ? '✓' : '✗'} ${name} (${results.at(-1).seconds}s)`);
  if (!ok) {
    console.error(`${run.stdout}${run.stderr}`.split('\n').slice(-25).join('\n'));
    throw new Error(`step failed: ${name}`);
  }
  return run.stdout;
}
const pnpm = (name, args, options) => step(name, pnpmCmd, [...pnpmArgs, ...args], options);

async function smoke() {
  const port = 4561;
  const env = {
    ...process.env,
    AETHER_MODE: 'demo',
    AETHER_DATA_DIR: join(repo, '.data', 'demo'),
    PORT: String(port),
  };
  const server = spawn(process.execPath, ['apps/control/dist/main.js'], {
    cwd: repo,
    env,
    stdio: 'ignore',
  });
  try {
    let health;
    for (let i = 0; i < 60 && !health; i++) {
      await new Promise((r) => setTimeout(r, 250));
      health = await fetch(`http://127.0.0.1:${port}/health`)
        .then((r) => r.json())
        .catch(() => undefined);
    }
    if (health?.status !== 'ok' || health.mode !== 'demo')
      throw new Error('control did not become healthy');
    const token = readFileSync(join(repo, '.data', 'demo', 'owner-token'), 'utf8').trim();
    const login = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!login.ok || !cookie) throw new Error('login failed');
    const projects = await (
      await fetch(`http://127.0.0.1:${port}/api/projects`, { headers: { cookie } })
    ).json();
    const snapshot = await (
      await fetch(`http://127.0.0.1:${port}/api/projects/${projects[0].id}/snapshot`, {
        headers: { cookie },
      })
    ).json();
    if (snapshot.agents.length !== 12)
      throw new Error(`expected 12 demo agents, got ${snapshot.agents.length}`);
    results.push({ name: 'built control: health, login, snapshot', ok: true, seconds: 0 });
    console.log('✓ built control: health, login, snapshot (12 demo agents)');
  } finally {
    server.kill('SIGTERM');
  }
}

async function goSmoke() {
  const port = 4562;
  const go = spawn(pnpmCmd, [...pnpmArgs, 'go'], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER: 'none',
      AETHER_DATA_DIR: join(repo, '.data', 'go'),
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    detached: true,
  });
  let timer;
  try {
    const code = await new Promise((resolve, reject) => {
      let seen = '';
      go.stdout.on('data', (chunk) => {
        seen += chunk;
        const match = /#pair=([\w-]+)/.exec(seen);
        if (match) resolve(match[1]);
      });
      go.once('exit', () => reject(new Error('pnpm go ended before it printed a sign-in link')));
      timer = setTimeout(
        () => reject(new Error('pnpm go printed no sign-in link in 5 minutes')),
        300000,
      );
    });
    const redeem = await fetch(`http://127.0.0.1:${port}/api/pairings/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ code }),
    });
    if (!redeem.ok || !redeem.headers.get('set-cookie'))
      throw new Error('the sign-in link printed by pnpm go did not sign in');
    results.push({ name: 'pnpm go: build, start, sign-in link', ok: true, seconds: 0 });
    console.log('✓ pnpm go: build, start, sign-in link signs in');
  } finally {
    clearTimeout(timer);
    process.kill(-go.pid, 'SIGTERM');
  }
}

try {
  step('clone committed HEAD', 'git', ['clone', '--quiet', root, repo], { cwd: work });
  pnpm('install --frozen-lockfile', ['install', '--frozen-lockfile']);
  pnpm('typecheck', ['run', 'typecheck']);
  pnpm('lint', ['run', 'lint']);
  pnpm('format:check', ['run', 'format:check']);
  pnpm('build', ['run', 'build']);
  pnpm('unit and integration tests', ['run', 'test']);
  pnpm('verification report is current', ['run', 'verification:check']);
  pnpm('setup --demo', ['run', 'setup', '--demo'], {
    env: { AETHER_DATA_DIR: join(repo, '.data', 'demo') },
  });
  await smoke();
  await goSmoke();
  if (process.argv.includes('--e2e'))
    pnpm('browser tests', ['exec', 'playwright', 'test'], { timeout: 3600000 });
  console.log(`\nclean-room verification of ${head} passed (${results.length} steps)`);
} catch (error) {
  console.error(`\nclean-room verification of ${head} FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

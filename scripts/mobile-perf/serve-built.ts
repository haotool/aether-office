import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setup } from '../setup.ts';

const FORBIDDEN = new Set(['3000', '3001', '4310', '4320', '4330']);
const flags = (argv: string[]) => {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) continue;
    const next = argv[i + 1];
    out[token.slice(2)] = next === undefined || next.startsWith('--') ? true : next;
  }
  return out;
};

const args = flags(process.argv.slice(2));
const port = String(args.port ?? '4798');
if (FORBIDDEN.has(port)) throw new Error(`port ${port} is forbidden for audit perf`);
const tokenOut =
  typeof args['token-out'] === 'string' ? args['token-out'] : `.data/perf-${port}.json`;
const sessionsHome =
  process.env.AETHER_LOCAL_SESSIONS_HOME ?? mkdtempSync(join(tmpdir(), 'aether-perf-'));
process.env.AETHER_LOCAL_SESSIONS_HOME = sessionsHome;
const directory = mkdtempSync(join(sessionsHome, 'perf-'));
setup('demo', directory);
mkdirSync('.data', { recursive: true, mode: 0o700 });
writeFileSync(tokenOut, JSON.stringify({ directory, port: Number(port) }), { mode: 0o600 });

const env = {
  ...process.env,
  PORT: port,
  AETHER_MODE: 'demo',
  AETHER_DATA_DIR: directory,
  AETHER_E2E_LAN_ADDRESSES: '127.0.0.1,localhost',
  AETHER_CONTROL_URL: `http://127.0.0.1:${port}`,
};
const children = ['control', 'runner'].map((name) =>
  spawn(process.execPath, [`apps/${name}/dist/main.js`], { env, stdio: 'inherit' }),
);
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
  child.once('exit', (code) => {
    if (!stopped) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
console.error(`perf server listening on http://127.0.0.1:${port} token file ${tokenOut}`);

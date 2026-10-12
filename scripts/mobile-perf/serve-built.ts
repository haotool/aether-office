import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStack } from '../run-stack.ts';
import { setup } from '../setup.ts';
import { flags } from './flags.ts';

const FORBIDDEN = new Set(['3000', '3001', '4310', '4320', '4330']);
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
runStack(env);
console.error(`perf server listening on http://127.0.0.1:${port} token file ${tokenOut}`);

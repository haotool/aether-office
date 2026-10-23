import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStack } from './run-stack.js';
import { setup } from './setup.js';
const port = process.env['AETHER_E2E_PORT'] ?? '4320';
const directory = mkdtempSync(join(tmpdir(), 'aether-e2e-'));
setup('demo', directory);
mkdirSync('.data', { recursive: true, mode: 0o700 });
writeFileSync('.data/e2e-session.json', JSON.stringify({ directory, port: Number(port) }), {
  mode: 0o600,
});
const env = {
  ...process.env,
  PORT: port,
  AETHER_LOCAL_SIGN_IN: '0',
  AETHER_MODE: 'demo',
  AETHER_DATA_DIR: directory,
  AETHER_E2E_LAN_ADDRESSES: '127.0.0.1,localhost', // pairing links the phone context can open, without listening on the network
  AETHER_CONTROL_URL: `http://127.0.0.1:${port}`,
};
runStack(env);

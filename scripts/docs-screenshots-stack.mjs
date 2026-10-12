import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { setup } from './setup.ts';
import { LAN, port, root } from './docs-screenshots-config.mjs';
import { data, home, pids, spool, work } from './docs-screenshots-fixture.mjs';

export function startStack() {
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
export async function waitForHealth() {
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
export function stopStack() {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  rmSync(work, { recursive: true, force: true });
}

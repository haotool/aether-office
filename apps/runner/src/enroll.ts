import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertSecureControlUrl } from './transport.js';
import { print, warn } from './stdio.js';

/**
 * Redeems a single-use invitation and stores the machine credential (mode 0600, never
 * overwritten). The invitation expires in minutes and works once.
 */
export async function enrollRunner(options: {
  url: string;
  invitation: string;
  directory: string;
}): Promise<{ machineId: string }> {
  const url = assertSecureControlUrl(options.url);
  const response = await fetch(new URL('/api/runner/enroll', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitation: options.invitation }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as {
    machineId?: string;
    token?: string;
    error?: { code?: string };
  };
  if (!response.ok || !body.token || !body.machineId)
    throw new Error(body.error?.code ?? `ENROLL_HTTP_${response.status}`);
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(options.directory, 'runner-token'), `${body.token}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  return { machineId: body.machineId };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name: string) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? undefined : process.argv[at + 1];
  };
  const url = flag('--url');
  const invitation = process.env['AETHER_INVITATION'] ?? flag('--invitation');
  if (!url || !invitation) {
    warn(
      'usage: AETHER_INVITATION=<token> pnpm runner:enroll --url <control url> [--dir <data dir>]',
    );
    process.exit(2);
  }
  enrollRunner({ url, invitation, directory: resolve(flag('--dir') ?? '.data/live/runner-enroll') })
    .then((r) => print(`enrolled machine ${r.machineId}`))
    .catch((e: Error) => {
      warn(`enrollment failed: ${e.message}`);
      process.exit(1);
    });
}

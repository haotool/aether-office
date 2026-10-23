import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { pairingFailure, requestPairing } from '../apps/control/src/services/remote/pairing.js';
import { say } from '../apps/control/src/stdio.js';
import { parsePort, portFree } from './ports.js';

const OPENERS: Record<string, string> = { darwin: 'open', linux: 'xdg-open' };

/** The command that opens the link: BROWSER (`none` opens nothing), else open on macOS and xdg-open on Linux. */
export function openCommand(
  url: string,
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): [string, string[]] | null {
  const opener = env['BROWSER'] || OPENERS[platform];
  return opener && opener !== 'none' ? [opener, [url]] : null;
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const answers = (base: string) =>
  fetch(`${base}/health`)
    .then((response) => response.json() as Promise<{ status?: string }>)
    .then(
      (health) => health.status === 'ok',
      () => false,
    );

/** Builds and starts the control plane, and returns once it answers. */
async function start(base: string, port: number): Promise<ChildProcess> {
  if (!(await portFree(port, process.env['AETHER_HOST'] ?? '127.0.0.1')))
    return fail(
      say(
        `Port ${port} is used by something that is not AETHER. Stop it, or pick another with PORT=<number> pnpm go.`,
        `埠 ${port} 被其他程式使用（不是 AETHER）。請先停掉它，或用 PORT=<數字> pnpm go 改用其他埠。`,
      ),
    );
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const child = spawn(process.execPath, ['apps/control/dist/main.js'], { stdio: 'inherit' });
  let stopping = false;
  child.once('exit', (code) => process.exit(stopping ? 0 : (code ?? 1)));
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      stopping = true;
      child.kill('SIGTERM');
    });
  for (let waited = 0; !(await answers(base)); waited += 500) {
    if (waited >= 30_000) {
      child.kill('SIGTERM');
      return fail(
        say(
          `AETHER did not answer on ${base} within 30 seconds.`,
          `AETHER 在 30 秒內沒有在 ${base} 回應。`,
        ),
      );
    }
    await sleep(500);
  }
  return child;
}

function openLink(url: string) {
  const open = openCommand(url);
  if (!open) return;
  const opener = spawn(open[0], open[1], { stdio: 'ignore', detached: true });
  opener.once('error', () => undefined);
  opener.unref();
}

/** `pnpm go`: build and start the control plane unless one already answers, then open the browser signed in. */
async function go() {
  const port = parsePort(process.env['PORT']);
  if (port === null)
    return fail(
      say('PORT must be a whole number from 1024 to 65535.', 'PORT 必須是 1024 到 65535 的整數。'),
    );
  const base = `http://127.0.0.1:${port}`;
  const directory = resolve(process.env['AETHER_DATA_DIR'] ?? '.data/live');
  let server: ChildProcess | undefined;
  if (await answers(base))
    console.log(say(`AETHER is already running at ${base}.`, `AETHER 已在 ${base} 執行。`));
  else server = await start(base, port);
  const tokenFile = resolve(directory, 'owner-token');
  const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';
  const { status, offer } = await requestPairing(base, token);
  const link = offer?.links[0];
  if (!offer || !link) {
    server?.kill('SIGTERM');
    return fail(pairingFailure(status, base, directory));
  }
  const minutes = offer.ttlSeconds / 60;
  console.log(
    say(
      `Sign in with this link (it works once and expires in ${minutes} minutes):`,
      `用這個連結登入（只能用一次，${minutes} 分鐘後失效）：`,
    ),
  );
  console.log(link.url);
  openLink(link.url);
  if (server)
    console.log(
      say(
        'AETHER keeps running here. Press Ctrl+C to stop it.',
        'AETHER 會在這個視窗持續執行，按 Ctrl+C 停止。',
      ),
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await go();

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { say } from '../apps/control/src/stdio.js';
import { parsePort } from './ports.js';

export const LABEL = 'com.haotool.aether-office';
const KEPT_ENV = [
  'PATH',
  'PORT',
  'AETHER_HOST',
  'AETHER_DATA_DIR',
  'AETHER_TRUST_PROXY',
  'AETHER_LANG',
  'AETHER_HOME',
  'AETHER_NATIVE_CONFIG',
];

export type Launchctl = (args: string[]) => { status: number; output: string };
type Context = {
  root: string;
  node: string;
  env: NodeJS.ProcessEnv;
  home: string;
  uid: number;
  launchctl: Launchctl;
};

export const servicePaths = (home: string) => ({
  plist: join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`),
  log: join(home, 'Library', 'Logs', 'aether-office', 'control.log'),
});

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const str = (text: string) => `<string>${escape(text)}</string>`;
const entry = (key: string, value: string) => `  <key>${key}</key>${value}`;

/** The login service: the node that ran the install runs the built control plane, restarted at most every 30 seconds. */
export function servicePlist({
  root,
  node,
  env,
  home,
}: Pick<Context, 'root' | 'node' | 'env' | 'home'>) {
  const { log } = servicePaths(home);
  const settings = KEPT_ENV.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [[name, name === 'AETHER_DATA_DIR' ? resolve(value) : value]];
  });
  const variables = [...settings, ['AETHER_LOG_FILE', log]]
    .map(([name, value]) => `    <key>${name}</key>${str(value ?? '')}`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    entry('Label', str(LABEL)),
    entry(
      'ProgramArguments',
      `<array>${str(node)}${str(join(root, 'apps', 'control', 'dist', 'main.js'))}</array>`,
    ),
    entry('WorkingDirectory', str(root)),
    entry('EnvironmentVariables', `<dict>\n${variables}\n  </dict>`),
    entry('RunAtLoad', '<true/>'),
    entry('KeepAlive', '<true/>'),
    entry('ThrottleInterval', '<integer>30</integer>'),
    entry('StandardOutPath', str(log)),
    entry('StandardErrorPath', str(log)),
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export function installService(context: Context) {
  const { plist, log } = servicePaths(context.home);
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(plist, servicePlist(context));
  context.launchctl(['bootout', `gui/${context.uid}/${LABEL}`]);
  const loaded = context.launchctl(['bootstrap', `gui/${context.uid}`, plist]);
  if (loaded.status !== 0)
    throw new Error(loaded.output.trim() || `launchctl exited ${loaded.status}`);
}

export function uninstallService(context: Context) {
  context.launchctl(['bootout', `gui/${context.uid}/${LABEL}`]);
  rmSync(servicePaths(context.home).plist, { force: true });
}

/** Restarts the login service only when it was installed from this checkout. */
export function restartService(context: Context): 'absent' | 'restarted' | 'failed' {
  const { plist } = servicePaths(context.home);
  const ours =
    existsSync(plist) &&
    readFileSync(plist, 'utf8').includes(entry('WorkingDirectory', str(context.root)));
  if (!ours) return 'absent';
  const run = context.launchctl(['kickstart', '-k', `gui/${context.uid}/${LABEL}`]);
  return run.status === 0 ? 'restarted' : 'failed';
}

const launchctl: Launchctl = (args) => {
  const run = spawnSync('launchctl', args, { encoding: 'utf8' });
  return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}` };
};

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

function restart(context: Context) {
  const result = restartService(context);
  if (result === 'restarted')
    console.log(say('Restarted the AETHER service.', '已重新啟動 AETHER 服務。'));
  if (result === 'failed')
    console.error(
      say(
        'The AETHER service is installed but could not be restarted. Run pnpm service install to load it again.',
        'AETHER 服務已安裝但無法重新啟動。請執行 pnpm service install 重新載入。',
      ),
    );
}

function install(context: Context) {
  if (process.env['PORT'] !== undefined && parsePort(process.env['PORT']) === null)
    fail(
      say('PORT must be a whole number from 1024 to 65535.', 'PORT 必須是 1024 到 65535 的整數。'),
    );
  if (!existsSync(join(context.root, 'apps', 'control', 'dist', 'main.js')))
    fail(
      say(
        'Build first: pnpm build (the service runs apps/control/dist/main.js).',
        '請先執行 pnpm build（服務會執行 apps/control/dist/main.js）。',
      ),
    );
  try {
    installService(context);
  } catch (error) {
    fail(
      say(
        `launchctl could not load the service:\n${(error as Error).message}`,
        `launchctl 無法載入服務：\n${(error as Error).message}`,
      ),
    );
  }
  const { log } = servicePaths(context.home);
  console.log(
    say(
      `Installed. AETHER now starts at login and restarts if it stops. Log: ${log}\nRun pnpm go to open it signed in.`,
      `已安裝。AETHER 會在登入時啟動，停止時自動重啟。紀錄檔：${log}\n執行 pnpm go 即可開啟並直接登入。`,
    ),
  );
}

function uninstall(context: Context) {
  uninstallService(context);
  const { log } = servicePaths(context.home);
  console.log(
    say(
      `Removed the AETHER service. Its log stays in ${log}.`,
      `已移除 AETHER 服務，紀錄檔保留在 ${log}。`,
    ),
  );
}

/** `pnpm service install|uninstall`, and the restart that `pnpm build` ends with. */
function main(command: string | undefined) {
  if (process.platform !== 'darwin') {
    if (command === 'restart') return;
    fail(
      say(
        'pnpm service manages a macOS login service (launchd). On Linux, run pnpm start under your own supervisor, for example a systemd user unit.',
        'pnpm service 管理的是 macOS 登入服務（launchd）。在 Linux 請用你自己的 supervisor（例如 systemd user unit）執行 pnpm start。',
      ),
    );
  }
  const context: Context = {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    node: process.execPath,
    env: process.env,
    home: homedir(),
    uid: process.getuid?.() ?? 0,
    launchctl,
  };
  switch (command) {
    case 'restart':
      return restart(context);
    case 'install':
      return install(context);
    case 'uninstall':
      return uninstall(context);
    default:
      return fail(
        say('Usage: pnpm service <install|uninstall>', '用法：pnpm service <install|uninstall>'),
      );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv[2]);

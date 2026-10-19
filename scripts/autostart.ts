import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Service = { node: string; root: string; data: string; host: string };

const LABEL = 'com.haotool.aether-office';
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const str = (s: string) => `<string>${xml(s)}</string>`;

export function plist({ node, root, data, host }: Service) {
  const env = { AETHER_DATA_DIR: data, AETHER_HOST: host };
  const log = (name: string) => str(join(data, `aether-office.${name}.log`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key>${str(LABEL)}
<key>ProgramArguments</key><array>${str(node)}${str('apps/control/dist/main.js')}</array>
<key>WorkingDirectory</key>${str(root)}
<key>EnvironmentVariables</key><dict>${Object.entries(env)
    .map(([k, v]) => `<key>${k}</key>${str(v)}`)
    .join('')}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key>${log('stdout')}
<key>StandardErrorPath</key>${log('stderr')}
</dict></plist>
`;
}

const file = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const domain = `gui/${process.getuid?.() ?? 0}`;
const launchctl = (verb: string, ignoreFailure = false) => {
  try {
    execFileSync('launchctl', [verb, domain, file], { stdio: 'ignore' });
  } catch (error) {
    if (!ignoreFailure) throw error;
  }
};

export function autostart(action: 'on' | 'off' | 'status', service: Service) {
  if (process.platform !== 'darwin') throw new Error('Autostart supports macOS only.');
  if (action === 'status') return existsSync(file);
  launchctl('bootout', true);
  if (action === 'off') {
    rmSync(file, { force: true });
    return false;
  }
  if (!existsSync(join(service.root, 'apps/control/dist/main.js')))
    throw new Error('Run `pnpm build` first.');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, plist(service));
  launchctl('bootstrap');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, ...flags] = process.argv.slice(2);
  if (action !== 'on' && action !== 'off' && action !== 'status') {
    console.error('Usage: pnpm autostart <on [--lan]|off|status>');
    process.exit(1);
  }
  const on = autostart(action, {
    node: process.execPath,
    root: resolve('.'),
    data: resolve(process.env['AETHER_DATA_DIR'] ?? '.data/live'),
    host: flags.includes('--lan') ? '0.0.0.0' : '127.0.0.1',
  });
  console.log(`Start at login: ${on ? 'on' : 'off'}`);
}

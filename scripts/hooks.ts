import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { installHooksFile, removeHooksFile } from '../packages/providers/src/claude-hooks.js';

// Opt-in Claude Code hook installer. Default scope is one project's .claude/settings.local.json (gitignored).
// `--scope user` edits ~/.claude/settings.json and therefore fires for every session on this machine.
const [action, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest[rest.indexOf(name) + 1];
const scope = flag('--scope') ?? 'project';
const settings =
  scope === 'user'
    ? join(homedir(), '.claude', 'settings.json')
    : join(resolve(flag('--project') ?? process.cwd()), '.claude', 'settings.local.json');
const receiver = resolve(import.meta.dirname, '../packages/providers/src/hook-receiver.mjs');

if (action === 'install') await installHooksFile(settings, receiver);
else if (action === 'remove') await removeHooksFile(settings);
else {
  console.error('usage: pnpm hooks <install|remove> [--scope project|user] [--project <dir>]');
  process.exit(2);
}
console.log(`${action}: ${settings}`);

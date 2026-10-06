import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  approvalScriptsStatus,
  installApprovalScripts,
} from '../packages/providers/src/approval-install.js';
import { installHooksFile, removeHooksFile } from '../packages/providers/src/claude-hooks.js';
import {
  codexHookTrust,
  fileHookStatus,
  fileRemoteApprovals,
} from '../packages/providers/src/hook-status.js';

// Opt-in Claude Code hook installer. Default scope is one project's .claude/settings.local.json (gitignored).
// `--scope user` edits the provider's user-level file and therefore fires for every session on this machine.
const [action, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(name);
  return at < 0 ? undefined : rest[at + 1]; // absent flag is undefined, never the next token
};
const scope = flag('--scope') ?? 'project';
const provider = flag('--provider') ?? 'claude';
if (provider !== 'claude' && provider !== 'codex') {
  console.error('--provider must be claude or codex');
  process.exit(2);
}
// Claude: settings.local.json (gitignored) or ~/.claude/settings.json. Codex: <repo>/.codex/hooks.json or ~/.codex/hooks.json.
const [directory, file] =
  provider === 'codex' ? ['.codex', 'hooks.json'] : ['.claude', 'settings.local.json'];
const settings =
  scope === 'user'
    ? join(homedir(), directory, provider === 'codex' ? 'hooks.json' : 'settings.json')
    : join(resolve(flag('--project') ?? process.cwd()), directory, file);
const receiver = resolve(import.meta.dirname, '../packages/providers/src/hook-receiver.mjs');
// Opt-in: Claude Code's permission prompt can be answered from the AETHER panel. If nobody answers within the wait,
// Claude asks in its terminal as usual. It also needs Remote approvals switched on in AETHER's settings. The hook runs
// from a private copy in ~/.aether/hooks (not from this repository, where an agent could edit it).
const remote = rest.includes('--remote-approvals');
if (remote && provider !== 'claude') {
  console.error('--remote-approvals is for Claude Code only');
  process.exit(2);
}
const waitSeconds = flag('--wait') === undefined ? undefined : Number(flag('--wait'));

if (action === 'install')
  await installHooksFile(
    settings,
    receiver,
    undefined,
    provider,
    remote
      ? {
          script: await installApprovalScripts(),
          ...(waitSeconds === undefined ? {} : { waitSeconds }),
        }
      : undefined,
  );
else if (action === 'remove') await removeHooksFile(settings);
else if (action === 'status') {
  const file = await fileHookStatus(settings, provider);
  const missing = file.missing.length ? ` (missing ${file.missing.join(', ')})` : '';
  console.log(`${provider} hooks in ${settings}: ${file.state}${missing}`);
  if (provider === 'claude')
    console.log(
      `  remote approvals hook: ${(await fileRemoteApprovals(settings)) ? 'installed' : 'not installed'}`,
    );
  if (provider === 'claude')
    console.log(`  remote approvals scripts: ${await approvalScriptsStatus()}`);
  if (provider === 'codex' && file.state !== 'not_installed') {
    const cwd = resolve(flag('--project') ?? process.cwd());
    const trust = await codexHookTrust(flag('--codex') ?? 'codex', cwd);
    for (const hook of trust)
      console.log(
        `  ${hook.event}: ${hook.trusted ? 'trusted' : 'NOT trusted (review it with /hooks in Codex)'}${hook.enabled ? '' : ', disabled'}`,
      );
    if (!trust.length) console.log('  Codex lists none of our hooks in this scope');
  }
  process.exit(0);
} else {
  console.error(
    'usage: pnpm hooks <install|remove|status> [--provider claude|codex] [--scope project|user] [--project <dir>] [--remote-approvals [--wait <seconds>]]',
  );
  process.exit(2);
}
console.log(`${action}: ${settings}`);

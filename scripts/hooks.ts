import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  approvalScriptFiles,
  approvalScriptsStatus,
  installApprovalScripts,
} from '../packages/providers/src/approval-install.js';
import { installHooksFile, removeHooksFile } from '../packages/providers/src/claude-hooks.js';
import {
  codexHookTrust,
  fileHookStatus,
  fileRemoteApprovals,
} from '../packages/providers/src/hook-status.js';

const [action, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(name);
  return at < 0 ? undefined : rest[at + 1];
};
const scope = flag('--scope') ?? 'project';
const provider = flag('--provider') ?? 'claude';
if (provider !== 'claude' && provider !== 'codex') {
  console.error('--provider must be claude or codex');
  process.exit(2);
}
const [directory, file] =
  provider === 'codex' ? ['.codex', 'hooks.json'] : ['.claude', 'settings.local.json'];
const settings =
  scope === 'user'
    ? join(homedir(), directory, provider === 'codex' ? 'hooks.json' : 'settings.json')
    : join(resolve(flag('--project') ?? process.cwd()), directory, file);
const receiver = resolve(import.meta.dirname, '../packages/providers/src/hook-receiver.mjs');
// Opt-in: if nobody answers within the wait, Claude asks in its terminal as usual. It also needs Remote approvals
// switched on in AETHER's settings. The hook runs from a private copy in $AETHER_HOME/hooks (default ~/.aether/hooks),
// not from this repository where an agent could edit it.
const remote = rest.includes('--remote-approvals');
if (remote && provider !== 'claude') {
  console.error('--remote-approvals is for Claude Code only');
  process.exit(2);
}
const dryRun = rest.includes('--dry-run');
const waitSeconds = flag('--wait') === undefined ? undefined : Number(flag('--wait'));

if (action === 'install' || action === 'remove') {
  const files = [settings, ...(action === 'install' && remote ? approvalScriptFiles() : [])];
  console.log(`${dryRun ? 'would write' : 'writing'}:\n${files.map((f) => `  ${f}`).join('\n')}`);
  if (dryRun) process.exit(0);
}
process.on('uncaughtException', (error) => {
  console.error(`hooks ${action} failed: ${error.message}`);
  process.exit(1);
});
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
    'usage: pnpm hooks <install|remove|status> [--provider claude|codex] [--scope project|user] [--project <dir>] [--remote-approvals [--wait <seconds>]] [--dry-run]',
  );
  process.exit(2);
}
console.log(`${action}: ${settings}`);

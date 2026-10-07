import type { Activity } from '@aether/contracts';
export type ProviderResult = {
  outcome: 'submitted' | 'failed' | 'cancelled' | 'indeterminate';
  summary: string;
  headSha?: string;
  review?: { decision: 'approve' | 'changes_requested'; body: string; headSha: string };
};
export type ProviderSink = {
  started: (sessionId: string, processIdentity: string) => Promise<void>;
  activity: (activity: Activity, summary: string) => Promise<void>;
};
export { VERSION_PROBE_MS, processIdentity } from './process-identity.js';
export { runFixture } from './run-fixture.js';

export { CodexAdapter } from './codex.js';
export { ClaudeAdapter } from './claude.js';
export type { NativeSink, NativeOptions } from './protocol.js';
export { installHooksFile, removeHooksFile, HOOK_EVENTS } from './claude-hooks.js';
export { AcpAdapter, negotiationFrom, normalizeAcpUpdate, ACP_SDK_VERSION } from './acp.js';
export {
  assertClaudeVersion,
  assertCodexVersion,
  claudeRolloutVersion,
  codexRolloutVersion,
  codexVersion,
} from './compat.js';
export {
  groupAlive,
  groupStopper,
  inspectProcess,
  isOrphan,
  judgeSurvivor,
  parseIdentity,
  reapSurvivor,
  signalGroup,
  type Reaped,
} from './process-control.js';

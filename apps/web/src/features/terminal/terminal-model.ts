import { heldByOther, type TerminalControl } from './terminal-driver.js';
export type TerminalRow = {
  id: string;
  profile: string;
  state: string;
  agentState: 'working' | 'waiting' | 'idle' | 'unknown' | null;
  controlOwner: string | null;
  controlEpoch: number;
  leaseUntil: number | null;
};
export type TerminalList = {
  sessions: TerminalRow[];
  profiles: { machineId: string; name: string; terminalProfiles: string }[];
};
export const AGENT_LABEL = {
  working: 'terminalAgentWorking',
  waiting: 'terminalAgentWaiting',
  idle: 'terminalAgentIdle',
} as const;
export type TerminalDetail = TerminalRow & {
  snapshot: string | null;
  commands: { id: string; kind: string; state: string; result: string | null }[];
};
export type TerminalAccess = { enabled: boolean; epoch: number };
export type TerminalAct = (
  type: 'terminal.takeover' | 'terminal.release' | 'terminal.stop' | 'terminal.resize',
  extra?: Record<string, unknown>,
) => Promise<void>;
export type TerminalProfile = { machineId: string; profile: string; label: string };

export function profilesOf(profiles: TerminalList['profiles'] | undefined): TerminalProfile[] {
  return (
    profiles?.flatMap((m) =>
      (JSON.parse(m.terminalProfiles) as { name: string }[]).map((p) => ({
        machineId: m.machineId,
        profile: p.name,
        label: `${m.name} · ${p.name}`,
      })),
    ) ?? []
  );
}

type TerminalHint =
  | 'terminalWritable'
  | 'terminalClickToType'
  | 'terminalHeld'
  | 'terminalStarting'
  | 'terminalEnded';

export function terminalHint(
  data: TerminalControl | undefined,
  writable: boolean,
  userId: string,
  now: number,
): TerminalHint {
  if (writable) return 'terminalWritable';
  if (!data || data.state === 'queued') return 'terminalStarting';
  if (data.state !== 'running') return 'terminalEnded';
  return heldByOther(data, userId, now) ? 'terminalHeld' : 'terminalClickToType';
}

export const profileTitle = (name: string): string =>
  name.startsWith('claude-') ? 'Claude Code' : name.startsWith('codex-') ? 'Codex' : name;

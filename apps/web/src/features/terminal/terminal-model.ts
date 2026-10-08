export type TerminalRow = {
  id: string;
  profile: string;
  state: string;
  /** What the agent in it is doing, read from its screen; null when nothing is known. */
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
/** Whether typed text may be sent, and for which control epoch (a new epoch drops what was typed under the old). */
export type TerminalAccess = { enabled: boolean; epoch: number };
export type TerminalAct = (
  type: 'terminal.takeover' | 'terminal.release' | 'terminal.stop' | 'terminal.resize',
  extra?: Record<string, unknown>,
) => Promise<void>;
export type TerminalProfile = { machineId: string; profile: string; label: string };

/** Every terminal profile of every machine, as one choice each. */
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

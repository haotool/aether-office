export function toRecord(
  provider: 'claude' | 'codex',
  payload: unknown,
  now?: number,
): {
  at: number;
  provider: 'claude' | 'codex';
  event: string;
  sessionId: string;
  cwd: string;
  agentId?: string;
  agentType?: string;
  tool?: string;
  notification?: string;
} | null;

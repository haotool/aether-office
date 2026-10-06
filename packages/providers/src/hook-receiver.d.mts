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
  target?: string;
  toolUseId?: string;
  tags?: string[];
  ok?: boolean;
  notification?: string;
} | null;

export function outcomeOf(provider: 'claude' | 'codex', payload: unknown): boolean | undefined;
export function targetOf(input: unknown): string | undefined;

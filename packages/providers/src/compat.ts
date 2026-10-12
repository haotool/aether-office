import compat from '../generated/compat.json' with { type: 'json' };

// Which provider CLI releases this adapter code has been verified against. The list lives in
// generated/compat.json so the doctor, the tests and the adapters all read one source of truth.

export function codexVersion(output: string): string | null {
  return /^codex-cli (\d+\.\d+\.\d+)$/.exec(output.trim())?.[1] ?? null;
}

export function assertCodexVersion(output: string): void {
  const version = codexVersion(output);
  if (!version || !compat.verifiedCliVersions.includes(version))
    throw new Error('CODEX_VERSION_UNVERIFIED');
}

/** Claude Code is accepted per minor series (e.g. 2.1.x): patch releases do not need a code change. */
export function assertClaudeVersion(output: string): void {
  const match = /^(\d+\.\d+)\.\d+/.exec(output.trim());
  const series = match?.[1];
  if (!series || !compat.claudeCodeSeries.includes(series))
    throw new Error('CLAUDE_VERSION_UNVERIFIED');
}

export const claudeRolloutVersion = (version: string): boolean => {
  const match = /^(\d+\.\d+)\.\d+$/.exec(version);
  return !!match && compat.claudeCodeSeries.includes(match[1] ?? '');
};

export const codexRolloutVersion = (version: string): boolean =>
  compat.verifiedCliVersions.includes(version);

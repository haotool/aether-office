const version =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

// Version syntax identifies the CLI; the protocol handshake and decoded fields determine compatibility.
export const codexRolloutVersion = (value: string): boolean => version.test(value);
export const claudeRolloutVersion = codexRolloutVersion;

// Any other Codex channel carries hidden reasoning.
export const channelVisible = (v: unknown) => v == null || /^(final|commentary)$/.test(String(v));

export function codexVersion(output: string): string | null {
  const value = /^codex-cli (\S+)$/.exec(output.trim())?.[1];
  return value && codexRolloutVersion(value) ? value : null;
}

export function assertCodexVersion(output: string): void {
  if (!codexVersion(output)) throw new Error('CODEX_VERSION_INVALID');
}

export function assertClaudeVersion(output: string): void {
  const value = /^(\S+)(?: \(Claude Code\))?$/.exec(output.trim())?.[1];
  if (!value || !claudeRolloutVersion(value)) throw new Error('CLAUDE_VERSION_INVALID');
}

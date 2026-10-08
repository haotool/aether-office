/** One recent tool call of a session: the tool's name and a short, already redacted target (a file's base name, a command's first word). */
export type ToolCall = { tool: string; target: string | null };

/** What kind of work a tool call is, which decides how its row is drawn on a screen. */
export type WorkKind = 'edit' | 'read' | 'shell' | 'git' | 'test' | 'search' | 'web' | 'other';

const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const SHELL = new Set(['Bash', 'shell', 'exec_command', 'local_shell']);
const SEARCH = new Set(['Grep', 'Glob', 'LS']);
const WEB = new Set(['WebFetch', 'WebSearch']);
const TEST_RUNNER = /^(vitest|jest|pytest|playwright|mocha|tap)\b|\b(test|tests)$/;

export function kindOf({ tool, target }: ToolCall): WorkKind {
  if (EDIT.has(tool)) return 'edit';
  if (tool === 'Read') return 'read';
  if (SHELL.has(tool)) {
    if (target && /^git\b/.test(target)) return 'git';
    return target && TEST_RUNNER.test(target) ? 'test' : 'shell';
  }
  if (SEARCH.has(tool)) return 'search';
  return WEB.has(tool) ? 'web' : 'other';
}

/** "7s", "3m", "2h": how long ago, whole units, from milliseconds. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
}

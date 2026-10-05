/**
 * What a coding agent running in a terminal is doing, read off the screen's last lines: working, waiting for a person
 * to choose, or idle at its prompt. The terminal screens of Claude Code and Codex are the only thing a managed
 * terminal shows of them, and what they draw is chrome around prose, so the rules are conservative:
 *
 *  - only the bottom of the screen counts (a prompt or spinner scrolled far up is history);
 *  - a spinner is a glyph, a gerund and an ellipsis ("✻ Cooking…"), not any line that starts with a bullet;
 *  - a footer such as "Enter to confirm ·" counts, the same words inside a sentence do not;
 *  - a spinner that is directly above the input box means working; one with a reply between it and the prompt is over.
 *
 * The shapes follow what cli-agent-orchestrator (Apache-2.0) learned from live Claude Code and Codex screens; the
 * code is written here. Unknown wording is `unknown`, never a guess.
 */
export type TerminalAgentState = 'working' | 'waiting' | 'idle' | 'unknown';

const WINDOW_LINES = 15;
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// Cursor moves that redraw a line in place (up, down, line starts, column, position) end the line they leave.
const REDRAW = /\x1b\[[0-9;]*[ABEFGHf]/g;
const OTHER_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** The text of a terminal stream as lines: colors and modes gone, in-place redraws turned into line breaks. */
export function plainTerminalLines(raw: string): string[] {
  return raw
    .replace(OSC, '')
    .replace(REDRAW, '\n')
    .replace(OTHER_CSI, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !/^[\s─━═│┃╭╮╰╯├┤]+$/u.test(line));
}

const PROMPT = /^\s*(?:[❯›»>]|codex>)\s*$/u;
const SPINNER = /^\s*[✶✢✽✻✳·*]\s+\w+ing\b.*…/u;
const INTERRUPT = /\besc to interrupt\b/i;
const NUMBERED = /^\s*(?:[❯›>]\s*)?\d+\.\s+\S/u;
const QUESTION =
  /\b(?:Would you like|Do you want) to\b|\bDo you trust the contents\b|\bYes, I trust this folder\b/i;
const FOOTER = /↑\/↓ to navigate|\bEnter to confirm[ \t]*·/u;
const ASK = /^\s*(?:Approve|Allow)\b.*\b(?:y\/n|yes\/no)\b/i;
const MODAL = /\[[aA]\]\s+Accept\b|\[[dD]\]\s+Decline\b/;

function waiting(lines: readonly string[]): boolean {
  if (lines.some((l) => FOOTER.test(l) || ASK.test(l) || MODAL.test(l))) return true;
  const question = lines.findIndex((l) => QUESTION.test(l));
  return question >= 0 && lines.slice(question + 1).filter((l) => NUMBERED.test(l)).length >= 2;
}

export function terminalAgentState(raw: string): TerminalAgentState {
  const lines = plainTerminalLines(raw).slice(-WINDOW_LINES);
  if (!lines.length) return 'unknown';
  if (waiting(lines)) return 'waiting';
  const prompt = lines.findLastIndex((l) => PROMPT.test(l));
  const busy = lines.findLastIndex((l) => SPINNER.test(l) || INTERRUPT.test(l));
  if (busy >= 0 && (prompt < 0 || busy > prompt || prompt - busy <= 1)) return 'working';
  return prompt >= 0 ? 'idle' : 'unknown';
}

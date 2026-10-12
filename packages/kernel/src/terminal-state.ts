/**
 * Conservative rules over the screen's last lines: only the bottom counts, a spinner is a glyph, a gerund and an
 * ellipsis, and a footer counts only on its own line. The shapes follow cli-agent-orchestrator (Apache-2.0); the code
 * is written here. Unknown wording is `unknown`, never a guess.
 */
export type TerminalAgentState = 'working' | 'waiting' | 'idle' | 'unknown';

const WINDOW_LINES = 15;
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const REDRAW = /\x1b\[[0-9;]*[ABEFGHf]/g;
const OTHER_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function plainTerminalLines(raw: string): string[] {
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

import { neutralizeHtml } from './text-html.js';

/**
 * What the Claude Code and Codex CLIs wrap around a conversation's words, resolved wrapper by wrapper: a wrapper that
 * carries meaning becomes a typed notice (never shown as tags; ids and file paths inside it are not kept).
 */
export type Notice =
  | {
      kind: 'task';
      status: string | null;
      summary: string;
      exitCode: number | null;
      detail: string;
    }
  | { kind: 'command'; name: string; args: string }
  | { kind: 'output'; text: string; error: boolean }
  | { kind: 'context'; label: string; text: string }
  | { kind: 'hook'; text: string }
  | { kind: 'interrupted' };

const CONTEXT: Record<string, string> = {
  'system-reminder': 'system',
  environment_context: 'environment',
  ide_opened_file: 'ide',
  ide_selection: 'ide',
  ide_diagnostics: 'ide',
  user_instructions: 'instructions',
  permissions: 'instructions',
  recommended_plugins: 'plugins',
  goal_context: 'goal',
  codex_internal_context: 'internal',
  codex_delegation: 'internal',
  heartbeat: 'internal',
  skill: 'skill',
  plugin: 'plugin',
};
const SILENT = new Set([
  'thinking',
  'think',
  'command-message',
  'command-contents',
  'local-command-caveat',
  'oai-mem-citation',
]);
const NAMES = [
  ...Object.keys(CONTEXT),
  ...SILENT,
  'task-notification',
  'subagent_notification',
  'turn_aborted',
  'command-name',
  'command-args',
  'local-command-stdout',
  'local-command-stderr',
].join('|');
const OPENER = new RegExp(`<(${NAMES}|[a-z]+(?:-[a-z]+)*-hook)(?:\\s[^<>]*)?>`, 'gi');
const INTERRUPT = /^\[Request interrupted by user[^\]\n]*\]$/;
const MAX_NOTICES = 40;
const MAX_FIELD = 4000;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const SLOT = /(\d+)/g;
const SLOT_CHARS = /[]/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SPAN = /(`+)[^`]*?\1(?!`)/g;

function maskCode(text: string): { masked: string; restore: (s: string) => string } {
  const saved: string[] = [];
  const keep = (code: string) => `${saved.push(code) - 1}`;
  const lines: string[] = [];
  let fence: string | null = null;
  let block: string[] = [];
  for (const line of text.replace(SLOT_CHARS, '').split('\n')) {
    const mark = FENCE.exec(line)?.[1];
    if (fence !== null) {
      block.push(line);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && /^\s*\S+\s*$/.test(line)) {
        lines.push(keep(block.join('\n')));
        fence = null;
        block = [];
      }
    } else if (mark) {
      fence = mark;
      block = [line];
    } else lines.push(line.includes('`') ? line.replace(SPAN, keep) : line);
  }
  if (fence !== null) lines.push(keep(block.join('\n')));
  return {
    masked: lines.join('\n'),
    restore: (s) => s.replace(SLOT, (_, n: string) => saved[Number(n)] ?? ''),
  };
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const plain = (s: string) => neutralizeHtml(s.replace(ANSI, '')).trim();

function field(inner: string, name: string): string {
  const open = new RegExp(`<${name}(?:\\s[^<>]*)?>`, 'i').exec(inner);
  if (!open) return '';
  const from = open.index + open[0].length;
  const end = inner.toLowerCase().indexOf(`</${name}`, from);
  return inner.slice(from, end < 0 ? inner.length : end).trim();
}

const LEAF = /<([A-Za-z][\w:.-]*)(?:\s[^<>]*)?>([^<>]*)<\/\1\s*>/g;
const facts = (inner: string) =>
  inner.replace(LEAF, (_, name: string, value: string) =>
    value.trim() ? `\n${name}: ${value.trim()}\n` : '',
  );

function taskNotice(inner: string): Notice {
  const summary = cut(plain(field(inner, 'summary')), 200);
  const status = field(inner, 'status').toLowerCase();
  const exit = /\bexit code (-?\d{1,4})\b/i.exec(summary);
  return {
    kind: 'task',
    status: /^[a-z][a-z_-]{0,23}$/.test(status) ? status : null,
    summary: summary || cut(plain(inner.replace(LEAF, '')), 200),
    exitCode: exit ? Number(exit[1]) : null,
    detail: cut(plain(field(inner, 'result')), MAX_FIELD),
  };
}

type Extraction = { rest: string; notices: Notice[] };

function noticeOf(name: string, inner: string): Notice | null {
  if (name === 'task-notification' || name === 'subagent_notification') return taskNotice(inner);
  if (name === 'turn_aborted') return { kind: 'interrupted' };
  const label = CONTEXT[name];
  const output = name.startsWith('local-command-s');
  if (!label && !output && !name.endsWith('-hook')) return null;
  const body = cut(plain(label ? facts(inner) : inner), MAX_FIELD);
  if (!body) return null;
  if (output) return { kind: 'output', text: body, error: name.endsWith('stderr') };
  return label ? { kind: 'context', label, text: body } : { kind: 'hook', text: body };
}

function noteCommandPart(
  command: { name: string; args: string; slot: number },
  notices: Notice[],
  push: (notice: Notice) => void,
  name: string,
  inner: string,
): void {
  if (command.slot < 0) command.slot = notices.length;
  command[name === 'command-name' ? 'name' : 'args'] = plain(inner);
  if (command.slot === notices.length) push({ kind: 'command', name: '', args: '' });
}

function noteWrapperOpener(
  command: { name: string; args: string; slot: number },
  notices: Notice[],
  push: (notice: Notice) => void,
  name: string,
  inner: string,
): void {
  if (name === 'command-name' || name === 'command-args') {
    noteCommandPart(command, notices, push, name, inner);
    return;
  }
  const notice = noticeOf(name, inner);
  if (notice) push(notice);
}

function extract(text: string): Extraction {
  if (!text.includes('<') && !text.trimStart().startsWith('[')) return { rest: text, notices: [] };
  const { masked, restore } = maskCode(text);
  const lower = masked.toLowerCase();
  const lowered = lower.length === masked.length ? lower : masked;
  const notices: Notice[] = [];
  const parts: string[] = [];
  const command = { name: '', args: '', slot: -1 };
  const push = (notice: Notice) => {
    if (notices.length < MAX_NOTICES) notices.push(notice);
  };
  let at = 0;
  OPENER.lastIndex = 0;
  for (let m = OPENER.exec(masked); m; m = OPENER.exec(masked)) {
    const name = (m[1] ?? '').toLowerCase();
    const from = m.index + m[0].length;
    const close = lowered.indexOf(`</${name}`, from);
    const inner = restore(masked.slice(from, close < 0 ? masked.length : close));
    const gt = close < 0 ? -1 : masked.indexOf('>', close);
    const end = close < 0 ? masked.length : gt < 0 ? masked.length : gt + 1;
    parts.push(masked.slice(at, m.index));
    at = end;
    OPENER.lastIndex = end;
    noteWrapperOpener(command, notices, push, name, inner);
  }
  parts.push(masked.slice(at));
  return finish(restore(parts.join('')).trim(), notices, command);
}

function finish(
  rest: string,
  notices: Notice[],
  command: { name: string; args: string; slot: number },
): Extraction {
  const filled = notices.map((n, i) =>
    n.kind === 'command' && i === command.slot
      ? { ...n, name: command.name, args: command.args }
      : n,
  );
  const interrupted = INTERRUPT.test(rest);
  return {
    rest: interrupted ? '' : rest,
    notices: [
      ...filled.filter((n) => n.kind !== 'command' || n.name),
      ...(interrupted ? [{ kind: 'interrupted' } as const] : []),
    ],
  };
}

export function structureWrappers(text: string): { text: string; notices: Notice[] } {
  const { rest, notices } = extract(text);
  return { text: neutralizeHtml(rest).trim(), notices };
}

export function stripCliWrappers(text: string): string {
  const { rest, notices } = extract(text);
  const inline = notices.flatMap((n) =>
    n.kind === 'command'
      ? [`${n.name}${n.args ? ` ${n.args}` : ''}`]
      : n.kind === 'output'
        ? [n.text]
        : [],
  );
  return [rest, ...inline].filter(Boolean).join('\n').trim();
}

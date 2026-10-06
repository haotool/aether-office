import { stat } from 'node:fs/promises';
import { readEdge } from './file-edge.js';
import { redactSecrets } from './redaction.js';

/**
 * A live view of what a local session is saying and doing, read from the provider's own transcript.
 * Safety, following the practice of the projects reviewed in docs/research: a transcript is opened only by the key
 * the scanner found it under (a path is never accepted from a client), reads are bounded, hidden reasoning is never
 * collected, every text is cut short and stripped of credentials, and the result is plain text for the browser.
 */
const TAIL_BYTES = 256 * 1024;
const MAX_ENTRIES = 120; // a turn is mostly tool calls: enough to hold the last few turns whole
const MAX_TEXT = 1500;

type TranscriptEntry = {
  at: number | null;
  role: 'user' | 'assistant' | 'tool' | 'result';
  name: string | null;
  text: string;
  error: boolean;
  /** The provider's id for a tool call, the same on its result: how a call and its outcome are paired. */
  toolId: string | null;
  /** A tool call's target in a few words (a file path, a command), redacted; null for everything else. */
  summary: string | null;
};
type TranscriptAnalysis = {
  tools: { name: string; count: number }[];
  commands: string[];
  files: string[];
  messages: { user: number; assistant: number };
};

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const clip = (v: string, max = MAX_TEXT) => {
  const text = redactSecrets(v.replace(/\r/g, '')).trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
const stringify = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
// Context a provider injects ahead of the user's own words is not part of the conversation.
const INJECTED =
  /^\s*(<environment_context|<user_instructions|# AGENTS\.md|AGENTS\.md instructions|<system-reminder|<command-)/i;

const message = (at: number | null, role: 'user' | 'assistant', text: string): TranscriptEntry => ({
  at,
  role,
  name: null,
  text: clip(text),
  error: false,
  toolId: null,
  summary: null,
});
const call = (at: number | null, name: string, id: unknown, input: unknown): TranscriptEntry => ({
  at,
  role: 'tool',
  name,
  text: clip(stringify(input), 600),
  error: false,
  toolId: typeof id === 'string' ? id : null,
  summary: summaryOf(input),
});
const outcome = (
  at: number | null,
  id: unknown,
  output: unknown,
  error = false,
): TranscriptEntry => ({
  at,
  role: 'result',
  name: null,
  text: clip(stringify(output), 600),
  error,
  toolId: typeof id === 'string' ? id : null,
  summary: null,
});
const TARGET_KEYS = [
  'file_path',
  'path',
  'notebook_path',
  'command',
  'cmd',
  'pattern',
  'query',
  'url',
];
/** The one field of a tool's input that says what it is about, cut short. Input may be a JSON string (Codex). */
function summaryOf(input: unknown): string | null {
  let fields = obj(input);
  if (typeof input === 'string')
    try {
      fields = obj(JSON.parse(input));
    } catch {
      return null;
    }
  for (const key of TARGET_KEYS) {
    const v = fields[key];
    const text = Array.isArray(v) ? v.join(' ') : v;
    if (typeof text === 'string' && text.trim()) return clip(text, 120);
  }
  return null;
}

function claudeEntries(entry: Record<string, unknown>): TranscriptEntry[] {
  const body = obj(entry['message']);
  const role = body['role'];
  if (role !== 'user' && role !== 'assistant') return [];
  const at = time(entry['timestamp']);
  const content = body['content'];
  if (typeof content === 'string')
    return INJECTED.test(content) ? [] : [message(at, role, content)];
  const out: TranscriptEntry[] = [];
  for (const part of Array.isArray(content) ? content : []) {
    const block = obj(part);
    if (
      block['type'] === 'text' &&
      typeof block['text'] === 'string' &&
      !INJECTED.test(block['text'])
    )
      out.push(message(at, role, block['text']));
    else if (block['type'] === 'tool_use')
      out.push(call(at, String(block['name'] ?? 'tool'), block['id'], block['input']));
    else if (block['type'] === 'tool_result')
      out.push(outcome(at, block['tool_use_id'], block['content'], block['is_error'] === true));
    // 'thinking' blocks are hidden reasoning: never read.
  }
  return out;
}

function codexEntries(entry: Record<string, unknown>): TranscriptEntry[] {
  if (entry['type'] !== 'response_item') return [];
  const at = time(entry['timestamp']);
  const p = obj(entry['payload']);
  if (p['type'] === 'message' && (p['role'] === 'user' || p['role'] === 'assistant')) {
    const role = p['role'];
    return (Array.isArray(p['content']) ? p['content'] : [])
      .map((part) => obj(part)['text'])
      .filter((t): t is string => typeof t === 'string' && !INJECTED.test(t))
      .map((t) => message(at, role, t));
  }
  if (p['type'] === 'function_call' || p['type'] === 'custom_tool_call')
    return [call(at, String(p['name'] ?? 'tool'), p['call_id'], p['arguments'] ?? p['input'])];
  if (p['type'] === 'function_call_output' || p['type'] === 'custom_tool_call_output')
    return [outcome(at, p['call_id'], p['output'])];
  return []; // 'reasoning' items are hidden reasoning: never read.
}

/** Pure. Parses a transcript tail into the latest entries and a short analysis of the work in it. */
export function parseTranscript(provider: 'claude' | 'codex', tail: string) {
  const entries: TranscriptEntry[] = [];
  const toolCounts = new Map<string, number>();
  const commands: string[] = [];
  const files = new Set<string>();
  for (const line of tail.split('\n')) {
    let entry: Record<string, unknown>;
    try {
      entry = obj(JSON.parse(line));
    } catch {
      continue; // the first line of a tail read is usually cut in half
    }
    for (const e of provider === 'claude' ? claudeEntries(entry) : codexEntries(entry)) {
      entries.push(e);
      if (e.role !== 'tool' || !e.name) continue;
      toolCounts.set(e.name, (toolCounts.get(e.name) ?? 0) + 1);
      let input: Record<string, unknown> = {};
      try {
        input = obj(JSON.parse(e.text));
      } catch {
        /* free-form input (a patch) */
      }
      const command = input['command'] ?? input['cmd'];
      if (typeof command === 'string' || Array.isArray(command))
        commands.push(clip(Array.isArray(command) ? command.join(' ') : command, 160));
      for (const key of ['file_path', 'path', 'notebook_path'])
        if (typeof input[key] === 'string') files.add(String(input[key]));
      for (const match of e.text.matchAll(/\*\*\* (?:Update|Add|Delete) File: ([^\n\\"]+)/g))
        files.add(match[1]!.trim());
    }
  }
  const analysis: TranscriptAnalysis = {
    tools: [...toolCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    commands: commands.slice(-8),
    files: [...files].slice(-20),
    messages: {
      user: entries.filter((e) => e.role === 'user').length,
      assistant: entries.filter((e) => e.role === 'assistant').length,
    },
  };
  return { entries: entries.slice(-MAX_ENTRIES), analysis };
}

export async function readTranscript(provider: 'claude' | 'codex', file: string) {
  const { size, mtimeMs } = await stat(file);
  return {
    ...parseTranscript(provider, await readEdge(file, 'tail', TAIL_BYTES)),
    updatedAt: Math.round(mtimeMs),
    truncated: size > TAIL_BYTES,
  };
}

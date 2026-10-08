import { stat } from 'node:fs/promises';
import type { ToolCall } from '@aether/kernel';
import { readEdge } from '../platform/file-edge.js';

// What a session has been doing: its latest tool calls, read from the transcript's tail. Only each call's tool name and a
// short target (a file path, the start of a command, a subagent type) are taken, and only to classify the session on the
// server; they are never returned. The rest of the transcript (replies, tool output, file contents) is skipped.
const TAIL_BYTES = 1024 * 1024;
const MAX_ACTIONS = 40;
const TARGET_CHARS = 300;

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const text = (v: unknown) =>
  typeof v === 'string' && v ? v.replace(/\s+/g, ' ').trim().slice(0, TARGET_CHARS) : null;

const CLAUDE_TARGETS = ['file_path', 'notebook_path', 'command', 'subagent_type', 'path'] as const;

/** Pure. The tool calls in the assistant messages of a Claude Code transcript tail, oldest first. */
export function claudeActions(tail: string): ToolCall[] {
  const out: ToolCall[] = [];
  for (const line of tail.split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    try {
      const content = obj(obj(JSON.parse(line))['message'])['content'];
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = obj(block);
        if (b['type'] !== 'tool_use' || typeof b['name'] !== 'string') continue;
        const input = obj(b['input']);
        const key = CLAUDE_TARGETS.find((k) => typeof input[k] === 'string');
        out.push({ tool: b['name'], target: key ? text(input[key]) : null });
      }
    } catch {
      /* cut line */
    }
  }
  return out.slice(-MAX_ACTIONS);
}

const PATCHED = /\*\*\* (?:Add|Update) File: (\S+)/g;

/** The command a Codex shell call runs: `cmd` or `command`, as one string or an argument list. */
function codexCommand(args: Record<string, unknown>): string | null {
  const raw = args['cmd'] ?? args['command'];
  return text(Array.isArray(raw) ? raw.join(' ') : raw);
}

function codexCallBody(payload: Record<string, unknown>): string {
  if (typeof payload['input'] === 'string') return payload['input'];
  if (typeof payload['arguments'] === 'string') return payload['arguments'];
  return '';
}

function pushCodexCallActions(out: ToolCall[], payload: Record<string, unknown>): void {
  const kind = payload['type'];
  if (kind !== 'function_call' && kind !== 'custom_tool_call') return;
  const body = codexCallBody(payload);
  for (const m of body.matchAll(PATCHED)) out.push({ tool: 'apply_patch', target: text(m[1]) });
  if (payload['name'] === 'apply_patch') return;
  let command: string | null = null;
  if (kind === 'function_call') {
    try {
      command = codexCommand(obj(JSON.parse(body)));
    } catch {
      command = null;
    }
  } else command = text(body);
  if (command) out.push({ tool: 'exec_command', target: command });
}

/** Pure. The tool calls in a Codex rollout tail: shell commands, and the files its patches touch. */
export function codexActions(tail: string): ToolCall[] {
  const out: ToolCall[] = [];
  for (const line of tail.split('\n')) {
    if (!line.includes('_call"')) continue;
    try {
      pushCodexCallActions(out, obj(obj(JSON.parse(line))['payload']));
    } catch {
      /* cut line */
    }
  }
  return out.slice(-MAX_ACTIONS);
}

const cache = new Map<string, { mtime: number; size: number; actions: ToolCall[] }>();

/** A session's latest tool calls, re-read only when its transcript changed. Empty when it cannot be read. */
export async function readActions(provider: 'claude' | 'codex', file: string): Promise<ToolCall[]> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.actions;
    const tail = await readEdge(file, 'tail', TAIL_BYTES);
    const actions = provider === 'claude' ? claudeActions(tail) : codexActions(tail);
    if (cache.size > 512) cache.clear();
    cache.set(file, { mtime: mtimeMs, size, actions });
    return actions;
  } catch {
    return [];
  }
}

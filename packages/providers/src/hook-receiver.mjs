#!/usr/bin/env node
// Hook receiver for Claude Code and Codex. Usage: hook-receiver.mjs <claude|codex> (payload on stdin).
// Appends one minimal record (ids, event name, cwd, tool name, a short target such as a file's base name, labels from a
// closed vocabulary and, once the tool ended, whether it succeeded) to a local spool. It never stores prompts, tool input
// or output (a command's arguments, paths and patterns are classified into labels and dropped), never touches the network,
// and always exits 0 so it can never block an agent.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { commandTags } from './command-tags.mjs';

const MAX_INPUT = 1024 * 1024;
const MAX_SPOOL = 1024 * 1024;
// Only the tool's name is kept, never its input or output.
const toolName = (v) => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : undefined);
// An id the provider made up (a tool call's), kept only when it looks like one.
const opaqueId = (v) => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : undefined);
const text = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 512 ? v : undefined);

const LAUNCHERS = new Set(['git', 'pnpm', 'npm', 'yarn', 'cargo', 'go', 'bun']);
const word = (v, max) =>
  typeof v === 'string' && new RegExp(`^[\\w.+-]{1,${max}}$`).test(v) ? v : undefined;

/**
 * A few characters of what the tool acts on, enough for a screen to say "editing app.ts" or "running pnpm test":
 * a file's base name, the first word of a command (and a plain subcommand after a launcher such as git or pnpm),
 * a fetched URL's host. Never a path, arguments, a search pattern or any content.
 */
export function targetOf(input) {
  const path = input?.file_path ?? input?.notebook_path;
  if (typeof path === 'string') return word(path.split(/[\\/]/).pop(), 60);
  if (typeof input?.command === 'string') {
    const words = input.command
      .trim()
      .split(/\s+/)
      .filter((w) => !w.includes('=')); // a leading VAR=value is not the command
    const first = word(words[0]?.split('/').pop(), 40);
    const sub = /^[a-z][a-z-]{0,19}$/.test(words[1] ?? '') ? words[1] : undefined;
    return first && sub && LAUNCHERS.has(first) ? `${first} ${sub}` : first;
  }
  if (typeof input?.url === 'string')
    return word(/^https?:\/\/([\w.-]+)(?::\d+)?(?:[/?#]|$)/.exec(input.url)?.[1], 60);
  return undefined;
}

/** A shell command line: Claude's `command` (a string) or Codex's `cmd` (a string) / `command` (an argument list). */
function commandOf(input) {
  const raw = input?.command ?? input?.cmd;
  return Array.isArray(raw) ? raw.filter((w) => typeof w === 'string').join(' ') : raw;
}

// A Codex tool response may say how the command ended as a number; anything else says nothing.
const exitCodeOf = (response) => {
  const r = typeof response === 'string' ? safeParse(response) : response;
  const code = r?.exit_code ?? r?.metadata?.exit_code;
  return typeof code === 'number' && Number.isInteger(code) ? code : undefined;
};
const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * How a tool call ended, only when the provider said so. Claude Code runs PostToolUse when the tool succeeded and
 * PostToolUseFailure when it failed (an interrupt by the person is neither: unknown); Codex's PostToolUse may carry an
 * exit code. Anything else is undefined, never a guess.
 */
export function outcomeOf(provider, payload) {
  if (payload?.hook_event_name === 'PostToolUseFailure')
    return payload.is_interrupt === true ? undefined : false;
  if (payload?.hook_event_name !== 'PostToolUse') return undefined;
  if (provider === 'claude') return true; // an MCP tool's response may hold any JSON: never read an exit code from it
  const code = exitCodeOf(payload.tool_response);
  return code === undefined ? undefined : code === 0;
}

export function spoolPath(env = process.env) {
  return (
    env.AETHER_HOOK_SPOOL ??
    join(env.AETHER_HOME ?? join(homedir(), '.aether'), 'hook-events.jsonl')
  );
}

function labelsOf(payload) {
  if (payload.hook_event_name !== 'PreToolUse') return undefined;
  const tags = commandTags(
    commandOf(payload.tool_input),
    toolName(payload.tool_name),
    payload.tool_input?.pattern,
  );
  return tags.length ? tags : undefined;
}

export function toRecord(provider, payload, now = Date.now()) {
  const event = text(payload?.hook_event_name);
  const sessionId = text(payload?.session_id);
  const cwd = text(payload?.cwd);
  if (!event || !sessionId || !cwd) return null;
  return {
    at: now,
    provider,
    event,
    sessionId,
    cwd,
    agentId: text(payload.agent_id),
    agentType: text(payload.agent_type),
    tool: toolName(payload.tool_name),
    target: targetOf(payload.tool_input),
    toolUseId: opaqueId(payload.tool_use_id), // an opaque id: how a call and its result are paired
    tags: labelsOf(payload),
    ok: outcomeOf(provider, payload),
    notification: toolName(payload.notification_type), // permission_prompt, idle_prompt: a type name, never the message
  };
}

export function append(record, file = spoolPath()) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    if (statSync(file).size > MAX_SPOOL) renameSync(file, `${file}.1`);
  } catch {
    // no spool yet
  }
  appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

async function main() {
  const provider = process.argv[2] === 'codex' ? 'codex' : 'claude';
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > MAX_INPUT) return;
  }
  const record = toRecord(provider, JSON.parse(input));
  if (record) append(record);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}

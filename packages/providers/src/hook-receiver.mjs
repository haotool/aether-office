#!/usr/bin/env node
// Hook receiver for Claude Code and Codex. Usage: hook-receiver.mjs <claude|codex> (payload on stdin).
// Appends one minimal record (ids, event name, cwd) to a local spool. It never stores prompts, tool
// input or output, never touches the network, and always exits 0 so it can never block an agent.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const MAX_INPUT = 1024 * 1024;
const MAX_SPOOL = 1024 * 1024;
// Only the tool's name is kept, never its input or output.
const toolName = (v) => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : undefined);
const text = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 512 ? v : undefined);

export function spoolPath(env = process.env) {
  return env.AETHER_HOOK_SPOOL ?? join(homedir(), '.aether', 'hook-events.jsonl');
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

import { basename } from 'node:path';
import type { LocalSession } from '@aether/contracts';
import type { AgentProcess } from '../runtime/agent-processes.js';
import type { HookState } from '../hooks/hook-spool.js';
import type { Raw } from './session-discovery.js';
import { classifyLiveness } from './session-liveness.js';
import { roleOf } from './session-role.js';
import type { SessionSignals } from './session-signals.js';
import { topicTitle } from './session-topic.js';

export type SessionReads = {
  info: { git: LocalSession['git']; worktree: LocalSession['worktree'] } | undefined;
  hook: HookState | undefined;
  signal: SessionSignals;
  usage: LocalSession['usage'];
  title: string | null;
  topic: string | null;
  actions: Parameters<typeof roleOf>[1]['transcript'];
  run: { state: LocalSession['process']; process: AgentProcess | null } | undefined;
  busyAt: (process: AgentProcess) => number | null;
};

function classificationOf(raw: Raw, key: string, reads: SessionReads, now: number) {
  const { info, hook, signal } = reads;
  return roleOf(
    key,
    {
      title: reads.title,
      prompt: reads.topic,
      branch: info?.git?.branch ?? null,
      repo: info?.worktree?.project ?? basename(raw.cwd),
      subagents: signal.subagents.map((c) => c.type),
      transcript: reads.actions,
      hook: (hook?.recent ?? [])
        .filter((c) => !c.agentId)
        .map(({ tool, target }) => ({ tool, target })),
    },
    now,
  );
}

function runtimeOf(raw: Raw, reads: SessionReads, now: number) {
  const { run, hook } = reads;
  const process = run?.process ?? null;
  return {
    process: run?.state ?? 'unknown',
    liveness: classifyLiveness({
      process,
      state: run?.state ?? 'unknown',
      mtime: raw.mtime,
      hookAt: hook?.at ?? null,
      busyAt: process ? reads.busyAt(process) : null,
      now,
    }),
    ports: process?.ports ?? [],
    resources: process ? { cpuPercent: process.cpuPercent, rssBytes: process.rssBytes } : null,
  };
}

export function assembleSession(raw: Raw, reads: SessionReads, now: number): LocalSession {
  const key = `${raw.provider}:${raw.sessionId}`;
  const { info, hook, signal } = reads;
  return {
    key,
    provider: raw.provider,
    sessionId: raw.sessionId,
    cwd: raw.cwd,
    repo: info?.worktree?.project ?? basename(raw.cwd),
    mtime: Math.round(raw.mtime),
    git: info?.git ?? null,
    worktree: info?.worktree ?? null,
    hook: hook
      ? {
          activity: hook.activity,
          lastEvent: hook.lastEvent,
          tool: hook.tool,
          at: hook.at,
          recent: signal.recent,
        }
      : null,
    subagents: signal.subagents,
    // A `codex exec` run has no thread name; its task's opening words name it. A Claude prompt is never sent.
    title: reads.title ?? (raw.provider === 'codex' ? topicTitle(reads.topic) : null),
    classification: classificationOf(raw, key, reads, now),
    usage: reads.usage,
    ...runtimeOf(raw, reads, now),
  };
}

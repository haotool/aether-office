import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { query, type Options, type Query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  record,
  text,
  type NativeOptions,
  type NativeSink,
  type ProviderEvent,
} from './protocol.js';
import { assertClaudeVersion } from './compat.js';
import { processIdentity, VERSION_PROBE_MS } from './process-identity.js';
import type { ProviderResult } from './index.js';

type Message = Record<string, unknown>;

const parentOf = (m: Message) =>
  typeof m['parent_tool_use_id'] === 'string' ? m['parent_tool_use_id'] : null;

function assistantEvents(m: Message, turnId: string): ProviderEvent[] {
  const message = record(m['message']);
  const content = message['content'];
  if (!Array.isArray(content)) return [];
  const out: ProviderEvent[] = [];
  for (const raw of content) {
    const block = record(raw);
    if (block['type'] === 'text')
      out.push({
        kind: 'assistant.message',
        messageId: text(m['uuid'] ?? message['id'], 200),
        turnId,
        text: text(block['text']),
      });
    else if (block['type'] === 'tool_use')
      out.push({
        kind: 'tool.requested',
        toolId: text(block['id'], 200),
        turnId,
        name: text(block['name'], 160),
        summary: text(block['name'], 160),
        parentToolId: parentOf(m),
      });
    // thinking/redacted_thinking blocks are intentionally not collected.
  }
  return out;
}

function toolResultEvents(m: Message, turnId: string): ProviderEvent[] {
  const content = record(m['message'])['content'];
  if (!Array.isArray(content)) return [];
  const out: ProviderEvent[] = [];
  for (const raw of content) {
    const block = record(raw);
    if (block['type'] !== 'tool_result') continue;
    out.push({
      kind: block['is_error'] === true ? 'tool.failed' : 'tool.completed',
      toolId: text(block['tool_use_id'], 200),
      turnId,
      name: 'tool',
      summary:
        typeof block['content'] === 'string'
          ? text(block['content'], 4000)
          : 'Tool result received.',
      parentToolId: parentOf(m),
    });
  }
  return out;
}

function resultEvents(m: Message, turnId: string): ProviderEvent[] {
  const out: ProviderEvent[] = [];
  let inputTokens = 0,
    outputTokens = 0;
  const totals = m['modelUsage'];
  if (totals && typeof totals === 'object')
    for (const usage of Object.values(totals)) {
      const value = record(usage);
      inputTokens +=
        Number(value['inputTokens'] ?? 0) +
        Number(value['cacheReadInputTokens'] ?? 0) +
        Number(value['cacheCreationInputTokens'] ?? 0);
      outputTokens += Number(value['outputTokens'] ?? 0);
    }
  if (
    Number.isSafeInteger(inputTokens) &&
    Number.isSafeInteger(outputTokens) &&
    inputTokens >= 0 &&
    outputTokens >= 0
  )
    out.push({ kind: 'usage', turnId, inputTokens, outputTokens });
  const success = m['subtype'] === 'success' && m['is_error'] === false;
  out.push({
    kind: success ? 'turn.completed' : 'turn.failed',
    turnId,
    summary:
      text(m['result']) ||
      (Array.isArray(m['errors'])
        ? m['errors']
            .map((e) => text(e, 2000))
            .join('\n')
            .slice(0, 32000)
        : text(m['subtype'])),
  });
  return out;
}

export function normalizeClaudeMessage(input: unknown, turnId: string): ProviderEvent[] {
  const m = record(input);
  switch (m['type']) {
    case 'system':
      return m['subtype'] === 'init' && typeof m['session_id'] === 'string'
        ? [{ kind: 'session.started', providerSessionId: m['session_id'] }]
        : [];
    case 'assistant':
      return assistantEvents(m, turnId);
    case 'tool_progress':
      return [
        {
          kind: 'tool.started',
          toolId: text(m['tool_use_id'], 200),
          turnId,
          name: text(m['tool_name'], 160),
          summary: 'Provider reported tool progress.',
          parentToolId: parentOf(m),
        },
      ];
    case 'user':
      return toolResultEvents(m, turnId);
    case 'result':
      return resultEvents(m, turnId);
    default:
      return [];
  }
}

const MCP_SERVERS = z.record(
  z.string(),
  z.strictObject({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()),
  }),
);

const deny = (toolUseID: string, message: string) => ({
  behavior: 'deny' as const,
  message,
  toolUseID,
});

/** Review sessions read only; every session may not start sub-agents. */
const toolPolicy = (readOnlyReview: boolean): Partial<Options> =>
  readOnlyReview
    ? {
        tools: ['Read', 'Glob', 'Grep'],
        disallowedTools: ['Agent', 'Task', 'Bash', 'Write', 'Edit', 'NotebookEdit'],
      }
    : { disallowedTools: ['Agent', 'Task'] };

type RunState = { processReady: Promise<void> };

export class ClaudeAdapter {
  private sessionId: string | null = null;
  private running: Query | undefined;
  private readonly abort = new AbortController();
  constructor(
    private readonly options: NativeOptions,
    private readonly sink: NativeSink,
  ) {}

  async run(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
    const version = execFileSync(this.options.binary, ['--version'], {
      encoding: 'utf8',
      timeout: VERSION_PROBE_MS,
    });
    assertClaudeVersion(version);
    const turnId = randomUUID();
    const state: RunState = { processReady: Promise.resolve() };
    const onAbort = () => this.abort.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => this.abort.abort(), this.options.timeoutMs);
    timer.unref();
    try {
      const options = this.queryOptions(signal, turnId, state);
      if (signal.aborted)
        return { outcome: 'cancelled', summary: 'Cancelled before starting the session.' };
      this.running = query({ prompt, options });
      return await this.consume(this.running, signal, turnId, state);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      this.running?.close();
    }
  }

  private queryOptions(signal: AbortSignal, turnId: string, state: RunState): Options {
    const { mcpConfig, readOnlyReview, env, model, resumeSessionId } = this.options;
    const mcpServers = mcpConfig ? MCP_SERVERS.parse(mcpConfig) : undefined;
    return {
      cwd: this.options.cwd,
      ...(mcpServers ? { mcpServers } : {}),
      ...(env ? { env } : {}),
      pathToClaudeCodeExecutable: this.options.binary,
      maxTurns: this.options.maxTurns,
      abortController: this.abort,
      permissionMode: 'default',
      permissionPrompts: 'host',
      allowDangerouslySkipPermissions: false,
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      ...toolPolicy(readOnlyReview === true),
      persistSession: true,
      includePartialMessages: false,
      ...(model ? { model } : {}),
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      spawnClaudeCodeProcess: this.spawnProcess(state),
      canUseTool: this.canUseTool(signal, turnId),
    };
  }

  private spawnProcess(state: RunState): NonNullable<Options['spawnClaudeCodeProcess']> {
    return (spawnOptions) => {
      const child: ChildProcessWithoutNullStreams = spawn(spawnOptions.command, spawnOptions.args, {
        cwd: spawnOptions.cwd,
        env: spawnOptions.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: spawnOptions.signal,
        detached: process.platform !== 'win32',
      });
      // Record the OS start identity, never infer ownership from a bare persisted PID.
      state.processReady = new Promise((resolve, reject) => {
        child.once('spawn', () => {
          try {
            void this.sink.processStarted(processIdentity(child)).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
        child.once('error', reject);
      });
      void state.processReady.catch(() => this.abort.abort());
      return child;
    };
  }

  /** Every tool request is decided by the human through the sink; a review session or a sub-agent never gets one. */
  private canUseTool(signal: AbortSignal, turnId: string): NonNullable<Options['canUseTool']> {
    const readOnlyReview = this.options.readOnlyReview;
    return async (toolName, input, context) => {
      if (readOnlyReview)
        return deny(context.toolUseID, 'Review sessions cannot escalate tool permissions.');
      if (context.signal.aborted || signal.aborted || !this.sessionId || context.agentID)
        return deny(context.toolUseID, 'Permission scope unavailable or cancelled.');
      try {
        const decision = await this.sink.permission({
          requestId: context.requestId,
          kind: toolName,
          toolId: context.toolUseID,
          turnId,
          providerSessionId: this.sessionId,
          parameters: input,
        });
        if (context.signal.aborted || signal.aborted)
          return deny(context.toolUseID, 'Permission request expired.');
        return decision === 'approve'
          ? { behavior: 'allow', updatedInput: input, toolUseID: context.toolUseID }
          : deny(context.toolUseID, 'Denied by AETHER operator.');
      } catch {
        return deny(context.toolUseID, 'Approval service unavailable.');
      }
    };
  }

  private async consume(
    stream: AsyncIterable<unknown>,
    signal: AbortSignal,
    turnId: string,
    state: RunState,
  ): Promise<ProviderResult> {
    const seen = new Set<string>();
    for await (const message of stream) {
      await state.processReady;
      for (const event of normalizeClaudeMessage(message, turnId)) {
        const key = JSON.stringify(event);
        if (seen.has(key)) continue;
        seen.add(key);
        await this.forward(event, turnId);
        if (event.kind === 'turn.completed' || event.kind === 'turn.failed')
          return {
            outcome: event.kind === 'turn.completed' ? 'submitted' : 'failed',
            summary: event.summary,
          };
      }
    }
    return {
      outcome: signal.aborted ? 'cancelled' : 'indeterminate',
      summary: 'Claude ended without a final result.',
    };
  }

  private async forward(event: ProviderEvent, turnId: string) {
    if (event.kind !== 'session.started') return this.sink.event(event);
    this.sessionId = event.providerSessionId;
    await this.sink.event(event);
    await this.sink.event({ kind: 'turn.started', turnId });
  }

  async interrupt(): Promise<void> {
    await this.running?.interrupt();
  }
  close(): void {
    this.abort.abort();
    this.running?.close();
  }
}

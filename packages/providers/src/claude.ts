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
import { processIdentity, VERSION_PROBE_MS, type ProviderResult } from './index.js';
export function normalizeClaudeMessage(input: unknown, turnId: string): ProviderEvent[] {
  const m = record(input);
  const out: ProviderEvent[] = [];
  if (m['type'] === 'system' && m['subtype'] === 'init' && typeof m['session_id'] === 'string')
    return [{ kind: 'session.started', providerSessionId: m['session_id'] }];
  if (m['type'] === 'assistant') {
    const message = record(m['message']);
    const content = message['content'];
    if (Array.isArray(content))
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
            parentToolId:
              typeof m['parent_tool_use_id'] === 'string' ? m['parent_tool_use_id'] : null,
          });
        // thinking/redacted_thinking blocks are intentionally not collected.
      }
  } else if (m['type'] === 'tool_progress') {
    out.push({
      kind: 'tool.started',
      toolId: text(m['tool_use_id'], 200),
      turnId,
      name: text(m['tool_name'], 160),
      summary: 'Provider reported tool progress.',
      parentToolId: typeof m['parent_tool_use_id'] === 'string' ? m['parent_tool_use_id'] : null,
    });
  } else if (m['type'] === 'user') {
    const content = record(m['message'])['content'];
    if (Array.isArray(content))
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
          parentToolId:
            typeof m['parent_tool_use_id'] === 'string' ? m['parent_tool_use_id'] : null,
        });
      }
  } else if (m['type'] === 'result') {
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
  }
  return out;
}
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
    const seen = new Set<string>();
    let processReady: Promise<void> = Promise.resolve();
    const onAbort = () => this.abort.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => this.abort.abort(), this.options.timeoutMs);
    timer.unref();
    const mcpServers = this.options.mcpConfig
      ? z
          .record(
            z.string(),
            z
              .object({
                command: z.string(),
                args: z.array(z.string()),
                env: z.record(z.string(), z.string()),
              })
              .strict(),
          )
          .parse(this.options.mcpConfig)
      : undefined;
    const options: Options = {
      cwd: this.options.cwd,
      ...(mcpServers ? { mcpServers } : {}),
      ...(this.options.env ? { env: this.options.env } : {}),
      pathToClaudeCodeExecutable: this.options.binary,
      maxTurns: this.options.maxTurns,
      abortController: this.abort,
      permissionMode: 'default',
      permissionPrompts: 'host',
      allowDangerouslySkipPermissions: false,
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      ...(this.options.readOnlyReview
        ? {
            tools: ['Read', 'Glob', 'Grep'],
            disallowedTools: ['Agent', 'Task', 'Bash', 'Write', 'Edit', 'NotebookEdit'],
          }
        : { disallowedTools: ['Agent', 'Task'] }),
      persistSession: true,
      includePartialMessages: false,
      ...(this.options.model ? { model: this.options.model } : {}),
      ...(this.options.resumeSessionId ? { resume: this.options.resumeSessionId } : {}),
      spawnClaudeCodeProcess: (spawnOptions) => {
        const child: ChildProcessWithoutNullStreams = spawn(
          spawnOptions.command,
          spawnOptions.args,
          {
            cwd: spawnOptions.cwd,
            env: spawnOptions.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            signal: spawnOptions.signal,
            detached: process.platform !== 'win32',
          },
        );
        // Record the OS start identity, never infer ownership from a bare persisted PID.
        processReady = new Promise((resolve, reject) => {
          child.once('spawn', () => {
            try {
              void this.sink.processStarted(processIdentity(child)).then(resolve, reject);
            } catch (error) {
              reject(error);
            }
          });
          child.once('error', reject);
        });
        void processReady.catch(() => this.abort.abort());
        return child;
      },
      canUseTool: async (toolName, input, context) => {
        if (this.options.readOnlyReview)
          return {
            behavior: 'deny',
            message: 'Review sessions cannot escalate tool permissions.',
            toolUseID: context.toolUseID,
          };
        if (context.signal.aborted || signal.aborted || !this.sessionId || context.agentID)
          return {
            behavior: 'deny',
            message: 'Permission scope unavailable or cancelled.',
            toolUseID: context.toolUseID,
          };
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
            return {
              behavior: 'deny',
              message: 'Permission request expired.',
              toolUseID: context.toolUseID,
            };
          // Returning a decision is not a provider acknowledgement. A later tool event
          // supplies execution evidence; the UI retains that distinction.
          return decision === 'approve'
            ? { behavior: 'allow', updatedInput: input, toolUseID: context.toolUseID }
            : {
                behavior: 'deny',
                message: 'Denied by AETHER operator.',
                toolUseID: context.toolUseID,
              };
        } catch {
          return {
            behavior: 'deny',
            message: 'Approval service unavailable.',
            toolUseID: context.toolUseID,
          };
        }
      },
    };
    try {
      if (signal.aborted)
        return { outcome: 'cancelled', summary: 'Cancelled before starting the session.' };
      this.running = query({ prompt, options });
      for await (const message of this.running) {
        await processReady;
        for (const event of normalizeClaudeMessage(message, turnId)) {
          const key = JSON.stringify(event);
          if (seen.has(key)) continue;
          seen.add(key);
          if (event.kind === 'session.started') {
            this.sessionId = event.providerSessionId;
            await this.sink.event(event);
            await this.sink.event({ kind: 'turn.started', turnId });
          } else await this.sink.event(event);
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
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      this.running?.close();
    }
  }
  async interrupt(): Promise<void> {
    await this.running?.interrupt();
  }
  close(): void {
    this.abort.abort();
    this.running?.close();
  }
}

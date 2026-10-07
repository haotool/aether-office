import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { APP_VERSION } from '@aether/contracts';
import type { InitializeParams } from '../generated/codex-0.159.2-ts/InitializeParams.js';
import type { ThreadStartParams } from '../generated/codex-0.159.2-ts/v2/ThreadStartParams.js';
import type { ThreadResumeParams } from '../generated/codex-0.159.2-ts/v2/ThreadResumeParams.js';
import type { TurnStartParams } from '../generated/codex-0.159.2-ts/v2/TurnStartParams.js';
import type { TurnInterruptParams } from '../generated/codex-0.159.2-ts/v2/TurnInterruptParams.js';
import type { TurnSteerParams } from '../generated/codex-0.159.2-ts/v2/TurnSteerParams.js';
import { assertCodexVersion } from './compat.js';
import { JsonRpcProcess } from './jsonrpc.js';
import {
  record,
  text,
  type NativeOptions,
  type NativeSink,
  type ProviderEvent,
} from './protocol.js';
import { processIdentity, VERSION_PROBE_MS } from './process-identity.js';
import type { ProviderResult } from './index.js';
const threadResponse = z.object({ thread: z.object({ id: z.string().min(1).max(200) }) });
const turnResponse = z.object({ turn: z.object({ id: z.string().min(1).max(200) }) });
export class CodexAdapter {
  close(): void {
    this.rpc.close();
  }
  readonly rpc: JsonRpcProcess;
  threadId: string | null = null;
  turnId: string | null = null;
  private pendingTurn = false;
  private readonly seen = new Set<string>();
  private readonly messages = new Map<string, string>();
  private events = Promise.resolve();
  private settle: ((result: ProviderResult) => void) | undefined;
  private fail: ((error: Error) => void) | undefined;
  constructor(
    private readonly options: NativeOptions,
    private readonly sink: NativeSink,
    transport?: JsonRpcProcess,
  ) {
    if (!transport) {
      const version = execFileSync(options.binary, ['--version'], {
        encoding: 'utf8',
        timeout: VERSION_PROBE_MS,
      }).trim();
      assertCodexVersion(version);
    }
    this.rpc =
      transport ??
      new JsonRpcProcess(options.binary, ['app-server', '--listen', 'stdio://'], {
        cwd: options.cwd,
        ...(options.env ? { env: options.env } : {}),
      });
    this.rpc.onNotification = (method, params) => {
      try {
        this.notification(method, params);
      } catch {
        this.fail?.(new Error('CODEX_EVENT_INVALID'));
      }
    };
    this.rpc.onClose = (error) => this.fail?.(error);
    this.rpc.onResponseSent = async (id) => {
      if (!this.options.readOnlyReview) await this.sink.permissionSent?.(String(id));
    };
    this.rpc.onRequest = async (method, params, id) => {
      const isQuestion = method === 'item/tool/requestUserInput';
      const isElicitation = method === 'mcpServer/elicitation/request';
      if (
        !isQuestion &&
        !isElicitation &&
        !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(
          method,
        )
      )
        throw new Error('UNSUPPORTED_SERVER_REQUEST');
      const p = record(params);
      const sessionId = this.threadId;
      if (
        !sessionId ||
        p['threadId'] !== sessionId ||
        (this.turnId !== null && p['turnId'] !== undefined && p['turnId'] !== this.turnId) ||
        (!this.pendingTurn && this.turnId === null)
      )
        throw new Error('APPROVAL_SCOPE_MISMATCH');
      // Codex asks the human before an MCP tool call by way of an elicitation tagged mcp_tool_call. That is a tool
      // approval, decided like any other: one call only. Codex also offers to remember the choice for the session; that
      // option is never taken.
      if (isElicitation && record(p['_meta'] ?? {})['codex_approval_kind'] === 'mcp_tool_call') {
        const meta = record(p['_meta']);
        const decision = this.options.readOnlyReview
          ? 'deny'
          : await this.sink.permission({
              requestId: String(id),
              kind: 'mcpToolCall',
              toolId:
                text(meta['tool_title'] ?? meta['tool_name'] ?? p['serverName'], 200) ||
                `mcp:${String(id)}`,
              turnId: text(p['turnId'], 200) || this.turnId || '',
              providerSessionId: sessionId,
              parameters: p,
            });
        return { action: decision === 'approve' ? 'accept' : 'decline' };
      }
      if (isQuestion || isElicitation) return this.unanswered(method, p, id);
      if (typeof p['turnId'] !== 'string') throw new Error('APPROVAL_SCOPE_MISMATCH');
      if (this.pendingTurn && !this.turnId) this.turnId = p['turnId'];
      const decision = this.options.readOnlyReview
        ? 'deny'
        : await this.sink.permission({
            requestId: String(id),
            kind: method.includes('commandExecution') ? 'command' : 'fileChange',
            toolId: text(p['itemId'], 200),
            turnId: p['turnId'],
            providerSessionId: sessionId,
            parameters: p,
          });
      // One invocation only: never approve a whole session or mutate a provider policy.
      const response = { decision: decision === 'approve' ? 'accept' : 'decline' };
      return response;
    };
  }
  /**
   * The agent asked the human a question (or an MCP server asked for input). No interactive channel is connected to a
   * managed run, so it is answered explicitly as "no answer" instead of failing the request, and recorded where the
   * human can see what was asked. Secret questions are never echoed.
   */
  private unanswered(method: string, p: Record<string, unknown>, id: string | number) {
    const questions = Array.isArray(p['questions']) ? p['questions'] : [];
    const asked = questions
      .map((q) => record(q))
      .filter((q) => q['isSecret'] !== true)
      .map((q) => text(q['header'], 80) || text(q['question'], 80))
      .filter(Boolean);
    const turnId = text(p['turnId'], 200) || this.turnId || '';
    const name = method === 'item/tool/requestUserInput' ? 'request_user_input' : 'mcp_elicitation';
    this.emit(
      {
        kind: 'tool.failed',
        toolId: text(p['itemId'], 200) || `request:${String(id)}`,
        turnId,
        name,
        summary:
          `The agent asked for input${asked.length ? `: ${asked.join('; ')}` : ''}. No interactive channel is connected to this run, so it was answered as "no answer".`.slice(
            0,
            4000,
          ),
        parentToolId: null,
      },
      `question:${String(id)}`,
    );
    return method === 'item/tool/requestUserInput' ? { answers: {} } : { action: 'decline' };
  }
  private emit(event: ProviderEvent, key: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.events = this.events.then(() => this.sink.event(event));
    void this.events.catch((error) =>
      this.fail?.(error instanceof Error ? error : new Error('EVENT_PERSISTENCE_FAILED')),
    );
  }
  private notification(method: string, input: unknown): void {
    if (
      ![
        'turn/started',
        'item/started',
        'item/completed',
        'thread/tokenUsage/updated',
        'turn/completed',
        'error',
      ].includes(method)
    )
      return; // Never collect hidden/private reasoning content.
    const p = record(input);
    if (p['threadId'] && p['threadId'] !== this.threadId) return;
    if (method === 'turn/started') {
      const turn = record(p['turn']);
      this.turnId = text(turn['id'], 200);
      this.emit({ kind: 'turn.started', turnId: this.turnId }, `turn.started:${this.turnId}`);
      return;
    }
    const turnId = text(p['turnId'], 200) || this.turnId || '';
    if (method === 'item/started' || method === 'item/completed') {
      const item = record(p['item']);
      const id = text(item['id'], 200);
      const type = item['type'];
      if (type === 'agentMessage' && method === 'item/completed') {
        const body = text(item['text']);
        this.messages.set(id, body);
        this.emit(
          { kind: 'assistant.message', messageId: id, turnId, text: body },
          `message:${id}`,
        );
      } else if (
        ['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall'].includes(String(type))
      ) {
        const failed =
          item['status'] === 'failed' ||
          item['status'] === 'declined' ||
          (typeof item['exitCode'] === 'number' && item['exitCode'] !== 0) ||
          item['success'] === false ||
          !!item['error'];
        const kind =
          method === 'item/started' ? 'tool.started' : failed ? 'tool.failed' : 'tool.completed';
        this.emit(
          {
            kind,
            toolId: id,
            turnId,
            name: text(item['tool'] ?? type, 160),
            summary: text(item['command'] ?? item['aggregatedOutput'] ?? item['status'], 4000),
            parentToolId: null,
          },
          `${kind}:${id}`,
        );
      }
    } else if (method === 'thread/tokenUsage/updated') {
      const usage = record(record(p['tokenUsage'])['last']);
      const inputTokens = z.number().int().nonnegative().parse(usage['inputTokens']);
      const outputTokens = z.number().int().nonnegative().parse(usage['outputTokens']);
      this.emit(
        { kind: 'usage', turnId, inputTokens, outputTokens },
        `usage:${turnId}:${inputTokens}:${outputTokens}`,
      );
    } else if (method === 'turn/completed') {
      const turn = record(p['turn']);
      const id = text(turn['id'], 200);
      const done = turn['status'] === 'completed';
      const summary =
        [...this.messages.values()].join('\n\n').slice(-32000) ||
        text(record(turn['error'] ?? {})['message']) ||
        (done
          ? 'Turn completed with no visible final message.'
          : 'Provider turn did not complete.');
      this.emit(
        { kind: done ? 'turn.completed' : 'turn.failed', turnId: id, summary },
        `turn.result:${id}`,
      );
      void this.events.then(
        () =>
          this.settle?.({
            outcome: done ? 'submitted' : turn['status'] === 'interrupted' ? 'cancelled' : 'failed',
            summary,
          }),
        (error) =>
          this.fail?.(error instanceof Error ? error : new Error('EVENT_PERSISTENCE_FAILED')),
      );
    } else if (method === 'error') this.fail?.(new Error('CODEX_PROVIDER_ERROR'));
  }
  async run(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
    const abort = () => {
      void this.interrupt().catch(() => this.rpc.close());
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await this.runOwned(prompt, signal);
    } finally {
      signal.removeEventListener('abort', abort);
      this.rpc.close();
    }
  }
  private async runOwned(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
    await this.rpc.ready;
    await this.sink.processStarted(processIdentity(this.rpc.child));
    const initialize: InitializeParams = {
      clientInfo: { name: 'aether_office', title: 'AETHER OFFICE', version: APP_VERSION },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        explicitGatewayOauth: true,
        optOutNotificationMethods: ['item/reasoning/textDelta', 'item/reasoning/summaryTextDelta'],
      },
    };
    await this.rpc.request('initialize', initialize);
    this.rpc.notify('initialized');
    const common: ThreadStartParams = {
      cwd: this.options.cwd,
      sandbox: this.options.readOnlyReview ? 'read-only' : 'workspace-write',
      approvalPolicy: 'untrusted',
      approvalsReviewer: 'user',
      ...(this.options.model ? { model: this.options.model } : {}),
      config: {
        'features.multi_agent': false,
        ...(this.options.mcpConfig ? { mcp_servers: z.json().parse(this.options.mcpConfig) } : {}),
      },
    };
    const response = this.options.resumeSessionId
      ? await this.rpc.request('thread/resume', {
          ...common,
          threadId: this.options.resumeSessionId,
          excludeTurns: true,
        } satisfies ThreadResumeParams)
      : await this.rpc.request('thread/start', common);
    this.threadId = threadResponse.parse(response).thread.id;
    await this.sink.event({ kind: 'session.started', providerSessionId: this.threadId });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completion = new Promise<ProviderResult>((resolve, reject) => {
      this.settle = resolve;
      this.fail = reject;
      timer = setTimeout(() => reject(new Error('PROVIDER_RUN_TIMEOUT')), this.options.timeoutMs);
      timer.unref();
    });
    // Always observe an early failure while a start request is still pending.
    void completion.catch(() => {});
    try {
      if (signal.aborted)
        return { outcome: 'cancelled', summary: 'Cancelled before starting the turn.' };
      this.pendingTurn = true;
      const params: TurnStartParams = {
        threadId: this.threadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
        approvalPolicy: 'untrusted',
        approvalsReviewer: 'user',
        sandboxPolicy: this.options.readOnlyReview
          ? { type: 'readOnly', networkAccess: false }
          : {
              type: 'workspaceWrite',
              writableRoots: [this.options.cwd],
              networkAccess: false,
              excludeTmpdirEnvVar: true,
              excludeSlashTmp: true,
            },
      };
      const started = turnResponse.parse(
        await this.rpc.request('turn/start', params, this.options.timeoutMs),
      );
      if (this.turnId && this.turnId !== started.turn.id) throw new Error('TURN_ID_MISMATCH');
      this.turnId = started.turn.id;
      this.pendingTurn = false;
      if (signal.aborted) await this.interrupt();
      return await completion;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) {
      this.rpc.close();
      return;
    }
    const params: TurnInterruptParams = { threadId: this.threadId, turnId: this.turnId };
    await this.rpc.request('turn/interrupt', params);
  }
  async steer(text: string): Promise<void> {
    if (!this.threadId || !this.turnId) throw new Error('ACTIVE_TURN_REQUIRED');
    const params: TurnSteerParams = {
      threadId: this.threadId,
      expectedTurnId: this.turnId,
      input: [{ type: 'text', text, text_elements: [] }],
    };
    await this.rpc.request('turn/steer', params);
  }
}

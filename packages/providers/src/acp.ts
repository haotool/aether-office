import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type InitializeResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import { APP_VERSION } from '@aether/contracts';
import type { ProviderEvent } from './protocol.js';
import { text, type NativeSink } from './protocol.js';
import { groupStopper } from './process-control.js';
import { processIdentity } from './process-identity.js';
import type { ProviderResult } from './index.js';

type AcpVersions = {
  wireProtocolVersion: number;
  offeredProtocolVersion: number;
  sdkVersion: string;
  agent: { name: string; version: string } | null;
};

type AcpNegotiation = {
  versions: AcpVersions;
  capabilities: {
    resume: boolean;
    image: boolean;
    audio: boolean;
    embeddedContext: boolean;
    mcp: boolean;
  };
  authMethods: string[];
};

export const ACP_SDK_VERSION = '1.9.0';

export function negotiationFrom(init: InitializeResponse): AcpNegotiation {
  const caps = init.agentCapabilities;
  return {
    versions: {
      wireProtocolVersion: init.protocolVersion,
      offeredProtocolVersion: PROTOCOL_VERSION,
      sdkVersion: ACP_SDK_VERSION,
      agent: init.agentInfo ? { name: init.agentInfo.name, version: init.agentInfo.version } : null,
    },
    capabilities: {
      resume: caps?.loadSession === true,
      image: caps?.promptCapabilities?.image === true,
      audio: caps?.promptCapabilities?.audio === true,
      embeddedContext: caps?.promptCapabilities?.embeddedContext === true,
      mcp: !!(caps?.mcpCapabilities?.http || caps?.mcpCapabilities?.sse),
    },
    authMethods: (init.authMethods ?? []).map((m) => m.id),
  };
}

type ToolLifecycleKind = 'tool.completed' | 'tool.failed' | 'tool.requested' | 'tool.started';

function toolKindFromCallStatus(status: string | undefined): ToolLifecycleKind {
  if (status === 'completed') return 'tool.completed';
  if (status === 'failed') return 'tool.failed';
  if (status === 'in_progress') return 'tool.started';
  return 'tool.requested';
}

function toolKindFromUpdateStatus(status: string): ToolLifecycleKind {
  if (status === 'completed') return 'tool.completed';
  if (status === 'failed') return 'tool.failed';
  return 'tool.started';
}

function toolCallEvent(
  update: Extract<SessionNotification['update'], { sessionUpdate: 'tool_call' }>,
  turnId: string,
): ProviderEvent[] {
  return [
    {
      kind: toolKindFromCallStatus(update.status),
      toolId: text(update.toolCallId, 200),
      turnId,
      name: text(update.kind ?? 'other', 160),
      summary: text(update.title, 4000),
      parentToolId: null,
    },
  ];
}

function toolCallUpdateEvent(
  update: Extract<SessionNotification['update'], { sessionUpdate: 'tool_call_update' }>,
  turnId: string,
): ProviderEvent[] {
  if (!update.status || update.status === 'pending') return [];
  return [
    {
      kind: toolKindFromUpdateStatus(update.status),
      toolId: text(update.toolCallId, 200),
      turnId,
      name: text(update.kind ?? 'other', 160),
      summary: text(update.title ?? '', 4000),
      parentToolId: null,
    },
  ];
}

/** Maps one session/update to canonical events. Thought chunks are never collected. */
export function normalizeAcpUpdate(n: SessionNotification, turnId: string): ProviderEvent[] {
  const u = n.update;
  switch (u.sessionUpdate) {
    case 'tool_call':
      return toolCallEvent(u, turnId);
    case 'tool_call_update':
      return toolCallUpdateEvent(u, turnId);
    default:
      return [];
  }
}

type AcpOptions = {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
};

const INITIALIZE_REQUEST = {
  protocolVersion: PROTOCOL_VERSION,
  clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  clientInfo: { name: 'aether-office', version: APP_VERSION },
};

const outcomeOf = (stopReason: string): ProviderResult['outcome'] =>
  stopReason === 'end_turn' ? 'submitted' : stopReason === 'cancelled' ? 'cancelled' : 'failed';

export class AcpAdapter {
  negotiated: AcpNegotiation | null = null;

  constructor(
    private readonly options: AcpOptions,
    private readonly sink: NativeSink,
  ) {}

  private open(
    signal: AbortSignal,
    onUpdate?: Client['sessionUpdate'],
    onPermission?: Client['requestPermission'],
  ) {
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env ?? { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
      stdio: ['pipe', 'pipe', 'ignore'],
      detached: process.platform !== 'win32', // its own group, so a stop reaches what the adapter started too
    });
    const stopper = groupStopper(child);
    const stop = stopper.stop;
    child.once('close', stopper.cancel);
    signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, this.options.timeoutMs);
    timer.unref();
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const client: Client = {
      requestPermission: onPermission ?? (async () => ({ outcome: { outcome: 'cancelled' } })),
      sessionUpdate: onUpdate ?? (async () => {}),
    };
    const connection = new ClientSideConnection(() => client, stream);
    const close = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (child.exitCode === null) stop();
    };
    return { child, connection, close };
  }

  async negotiate(signal: AbortSignal = new AbortController().signal): Promise<AcpNegotiation> {
    const { connection, close } = this.open(signal);
    try {
      const init = await connection.initialize(INITIALIZE_REQUEST);
      return negotiationFrom(init);
    } finally {
      close();
    }
  }

  /** Each run owns and closes its own child process; present so all adapters share one shape. */
  close(): void {}

  private async decidePermission(
    request: RequestPermissionRequest,
    turnId: string,
  ): Promise<RequestPermissionResponse> {
    const decision = await this.sink.permission({
      requestId: String(request.toolCall.toolCallId),
      kind: String(request.toolCall.kind ?? 'other'),
      toolId: String(request.toolCall.toolCallId),
      turnId,
      providerSessionId: String(request.sessionId),
      parameters: {
        title: request.toolCall.title ?? '',
        options: request.options.map((o) => o.kind),
      },
    });
    const wanted = decision === 'approve' ? 'allow_once' : 'reject_once';
    const option = request.options.find((o) => o.kind === wanted);
    return option
      ? { outcome: { outcome: 'selected', optionId: option.optionId } }
      : { outcome: { outcome: 'cancelled' } };
  }

  async run(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
    const turnId = 'acp-turn-1';
    const events: Promise<void>[] = [];
    const emit = (e: ProviderEvent) => void events.push(this.sink.event(e));
    let reply = '';
    const { child, connection, close } = this.open(
      signal,
      async (n) => {
        const u = n.update;
        if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text')
          reply = (reply + u.content.text).slice(0, 32000);
        for (const e of normalizeAcpUpdate(n, turnId)) emit(e);
      },
      (request) => this.decidePermission(request, turnId),
    );
    try {
      await this.sink.processStarted(processIdentity(child));
      const init = await connection.initialize(INITIALIZE_REQUEST);
      this.negotiated = negotiationFrom(init);
      const session = await connection.newSession({ cwd: this.options.cwd, mcpServers: [] });
      emit({ kind: 'session.started', providerSessionId: session.sessionId });
      emit({ kind: 'turn.started', turnId });
      const abort = () => void connection.cancel({ sessionId: session.sessionId });
      signal.addEventListener('abort', abort, { once: true });
      const response = await connection.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: prompt }],
      });
      signal.removeEventListener('abort', abort);
      if (reply)
        emit({ kind: 'assistant.message', messageId: `${turnId}-reply`, turnId, text: reply });
      const outcome = outcomeOf(response.stopReason);
      emit({
        kind: outcome === 'submitted' ? 'turn.completed' : 'turn.failed',
        turnId,
        summary: `stopReason=${response.stopReason}`,
      });
      await Promise.all(events);
      return { outcome, summary: reply || `stopReason=${response.stopReason}` };
    } catch (error) {
      await Promise.allSettled(events);
      if (signal.aborted) return { outcome: 'cancelled', summary: 'ACP run cancelled.' };
      return {
        outcome: 'failed',
        summary: error instanceof Error ? text(error.message, 500) : 'ACP_PROTOCOL_ERROR',
      };
    } finally {
      close();
    }
  }
}

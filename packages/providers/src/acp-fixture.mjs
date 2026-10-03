// Synthetic ACP agent used by contract tests. It speaks the real protocol through the official SDK
// but runs no model: replies are canned, and a tool call asks the client for permission first.
import { Readable, Writable } from 'node:stream';
import { AgentSideConnection, PROTOCOL_VERSION, ndJsonStream } from '@agentclientprotocol/sdk';

const cancelled = new Set();

class FixtureAgent {
  constructor(connection) {
    this.connection = connection;
  }
  async initialize() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: true },
      },
      agentInfo: { name: 'aether-acp-fixture', version: '0.0.1' },
      authMethods: [],
    };
  }
  async newSession() {
    return { sessionId: 'fixture-session-1' };
  }
  async authenticate() {
    return {};
  }
  async cancel(params) {
    cancelled.add(params.sessionId);
  }
  async prompt(params) {
    const { sessionId } = params;
    const update = (u) => this.connection.sessionUpdate({ sessionId, update: u });
    const prompt = params.prompt.map((b) => (b.type === 'text' ? b.text : '')).join('');
    if (prompt.includes('HANG')) {
      for (let i = 0; i < 100 && !cancelled.has(sessionId); i++)
        await new Promise((r) => setTimeout(r, 50));
      return { stopReason: 'cancelled' };
    }
    await update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'PRIVATE_REASONING' },
    });
    await update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello ' },
    });
    await update({
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-1',
      title: 'Run tests',
      kind: 'execute',
      status: 'pending',
    });
    const decision = await this.connection.requestPermission({
      sessionId,
      toolCall: { toolCallId: 'tool-1', title: 'Run tests', kind: 'execute' },
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
      ],
    });
    const allowed =
      decision.outcome.outcome === 'selected' && decision.outcome.optionId === 'allow';
    await update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'tool-1',
      status: allowed ? 'completed' : 'failed',
    });
    await update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: allowed ? 'world' : 'denied' },
    });
    return { stopReason: 'end_turn' };
  }
}

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
new AgentSideConnection((connection) => new FixtureAgent(connection), stream);

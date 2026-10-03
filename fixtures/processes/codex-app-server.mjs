// Synthetic wire fixture, not a captured Codex trace and never a paid model.
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
let resumed = false;
let starting;
let threadId = 'fixture-thread';
for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === 'initialize')
    send({
      id: message.id,
      result: {
        userAgent: 'synthetic-codex-wire',
        codexHome: '/fixture',
        platformFamily: 'unix',
        platformOs: 'fixture',
      },
    });
  else if (message.method === 'thread/start' || message.method === 'thread/resume') {
    resumed = message.method === 'thread/resume';
    threadId = message.params.threadId ?? threadId;
    send({ id: message.id, result: { thread: { id: threadId } } });
  } else if (message.method === 'turn/start') {
    if (message.params.sandboxPolicy.type === 'readOnly') {
      if (message.params.sandboxPolicy.networkAccess !== false)
        throw new Error('REVIEW_NETWORK_POLICY');
      const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      send({ id: message.id, result: { turn: { id: 'review-turn' } } });
      send({ method: 'turn/started', params: { threadId, turn: { id: 'review-turn' } } });
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId: 'review-turn',
          item: {
            type: 'agentMessage',
            id: 'review-answer',
            text: JSON.stringify({
              decision: 'approve',
              body: 'Synthetic native reviewer: fixed commit inspected, no live model used.',
              headSha,
            }),
          },
        },
      });
      send({
        method: 'turn/completed',
        params: { threadId, turn: { id: 'review-turn', status: 'completed', error: null } },
      });
      continue;
    }
    starting = message.id;
    // Intentionally ask for approval BEFORE answering the client's turn/start.
    send({
      id: 'permission-1',
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId,
        turnId: 'turn-1',
        itemId: 'tool-1',
        kind: 'command',
        startedAtMs: 1,
        environmentId: null,
        command: 'printf fixture',
        cwd: process.cwd(),
      },
    });
  } else if (message.id === 'permission-1' && message.result) {
    const decision = message.result.decision;
    send({ method: 'turn/started', params: { threadId, turn: { id: 'turn-1' } } });
    send({ id: starting, result: { turn: { id: 'turn-1' } } });
    const tool = {
      method: 'item/started',
      params: {
        threadId,
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'tool-1',
          command: 'printf fixture',
          status: 'inProgress',
        },
      },
    };
    send(tool);
    send(tool);
    send({
      method: 'item/completed',
      params: {
        threadId,
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'tool-1',
          command: 'printf fixture',
          status: 'failed',
          exitCode: 1,
        },
      },
    });
    send({
      method: 'item/reasoning/textDelta',
      params: { threadId, delta: 'PRIVATE_REASONING_MUST_NOT_ESCAPE' },
    });
    send({ method: 'a_future_notification_without_params' });
    send({
      method: 'item/completed',
      params: {
        threadId,
        turnId: 'turn-1',
        item: {
          type: 'agentMessage',
          id: 'message-1',
          text: `Fixture answer${resumed ? ' resumed' : ''} · ${decision} · 繁體中文 🦊`,
        },
      },
    });
    const usage = {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId,
        turnId: 'turn-1',
        tokenUsage: { last: { inputTokens: 10, outputTokens: 5 } },
      },
    };
    send(usage);
    send(usage);
    if (resumed) {
      usage.params.tokenUsage.last = { inputTokens: 14, outputTokens: 8 };
      send(usage);
      send(usage);
    }
    send({
      method: 'turn/completed',
      params: { threadId, turn: { id: 'turn-1', status: 'completed', error: null } },
    });
  } else if (message.method === 'turn/interrupt') send({ id: message.id, result: {} });
  else if (message.method === 'turn/steer')
    send({ id: message.id, result: { turnId: message.params.expectedTurnId } });
}

// Synthetic read-only reviewer protocol fixture; no actual model is invoked.
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
for await (const line of createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (m.method === 'initialize')
    send({
      id: m.id,
      result: {
        userAgent: 'synthetic-review',
        codexHome: '/fixture',
        platformFamily: 'unix',
        platformOs: 'fixture',
      },
    });
  else if (m.method === 'thread/start') {
    assert.equal(m.params.sandbox, 'read-only');
    send({ id: m.id, result: { thread: { id: 'review-thread' } } });
  } else if (m.method === 'turn/start') {
    assert.equal(m.params.sandboxPolicy.type, 'readOnly');
    assert.equal(m.params.sandboxPolicy.networkAccess, false);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.ok(m.params.input[0].text.includes(head));
    assert.ok(m.params.input[0].text.includes('Untrusted patch data'));
    send({ id: m.id, result: { turn: { id: 'review-turn' } } });
    send({
      method: 'turn/started',
      params: { threadId: 'review-thread', turn: { id: 'review-turn' } },
    });
    send({
      method: 'item/completed',
      params: {
        threadId: 'review-thread',
        turnId: 'review-turn',
        item: {
          type: 'agentMessage',
          id: 'review-message',
          text: JSON.stringify({
            decision: 'approve',
            body: 'Synthetic review inspected the fixed commit; not a live model verdict.',
            headSha: head,
          }),
        },
      },
    });
    send({
      method: 'turn/completed',
      params: {
        threadId: 'review-thread',
        turn: { id: 'review-turn', status: 'completed', error: null },
      },
    });
  }
}

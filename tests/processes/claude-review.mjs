// Synthetic CLI wire fixture driven by the real Claude Agent SDK, never a model.
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const argv = process.argv.slice(2),
  value = (flag) => argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
assert.equal(value('--tools'), 'Read,Glob,Grep');
assert.ok(value('--disallowedTools').includes('Bash'));
assert.ok(argv.includes('--strict-mcp-config'));
assert.ok(!argv.includes('--allow-dangerously-skip-permissions'));
const session_id = randomUUID(),
  send = (v) => process.stdout.write(JSON.stringify(v) + '\n');
for await (const line of createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (m.type === 'control_request')
    send({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: m.request_id,
        response: {
          commands: [],
          models: [],
          output_style: 'default',
          available_output_styles: ['default'],
        },
      },
    });
  else if (m.type === 'user') {
    send({
      type: 'system',
      subtype: 'init',
      session_id,
      uuid: randomUUID(),
      tools: ['Read', 'Glob', 'Grep'],
      mcp_servers: [],
      cwd: process.cwd(),
      model: 'synthetic-review',
      permissionMode: 'default',
      apiKeySource: 'none',
      slash_commands: [],
    });
    send({
      type: 'control_request',
      request_id: 'synthetic-denied-write',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'touch must-not-exist' },
        tool_use_id: 'synthetic-tool',
      },
    });
  } else if (m.type === 'control_response' && m.response.request_id === 'synthetic-denied-write') {
    assert.equal(m.response.response.behavior, 'deny');
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    send({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify({
        decision: 'approve',
        body: 'Synthetic Claude SDK review; tool escalation denied.',
        headSha,
      }),
      session_id,
      uuid: randomUUID(),
      num_turns: 1,
      duration_ms: 1,
      duration_api_ms: 0,
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
    });
  }
}

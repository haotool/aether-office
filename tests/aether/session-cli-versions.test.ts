import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readTranscript } from '../../apps/control/src/services/sessions/session-transcript.js';

const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const text = (role: string, type: string) => ({
  type: 'response_item',
  payload: { type: 'message', role, content: [{ type, text: role }] },
});

it.each(['2.1.309', '0.163.0', '999.0.0', '4.0.0-beta.1+build.7'])(
  'reads Claude Code and Codex transcripts written by CLI %s',
  async (version) => {
    const dir = await mkdtemp(join(tmpdir(), 'aether-cli-version-'));
    const claude = join(dir, 'claude.jsonl');
    const codex = join(dir, 'rollout.jsonl');
    await writeFile(
      claude,
      line({ type: 'user', version, message: { role: 'user', content: 'user' } }) +
        line({
          type: 'assistant',
          version,
          message: { role: 'assistant', content: [{ type: 'text', text: 'assistant' }] },
        }),
    );
    await writeFile(
      codex,
      line({ type: 'session_meta', payload: { id: 's', cwd: dir, cli_version: version } }) +
        line(text('user', 'input_text')) +
        line(text('assistant', 'output_text')),
    );
    for (const [provider, file] of [
      ['claude', claude],
      ['codex', codex],
    ] as const)
      expect((await readTranscript(provider, file)).analysis.messages).toEqual({
        user: 1,
        assistant: 1,
      });
  },
);

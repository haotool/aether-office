import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { LocalSession } from '../../packages/contracts/src/index.js';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import {
  readSpeech,
  resetSpeechCache,
  runningSpeech,
} from '../../apps/control/src/services/session-speech.js';

const line = (v: unknown) => JSON.stringify(v) + '\n';
const user = (content: string, timestamp = '2026-10-04T10:00:00Z') =>
  line({ type: 'user', timestamp, message: { role: 'user', content } });
const reply = (text: string, timestamp = '2026-10-04T10:00:05Z') =>
  line({
    type: 'assistant',
    timestamp,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });

async function transcript(content: string) {
  const dir = await mkdtemp(join(tmpdir(), 'aether-speech-'));
  const file = join(dir, 'sess.jsonl');
  await writeFile(file, content);
  return file;
}

it('picks the latest prompt and reply with their times, redacted, and ignores tools and thinking', async () => {
  const file = await transcript(
    user('first question') +
      reply('first answer') +
      user('Deploy with api_key=SECRETVALUE', '2026-10-04T11:00:00Z') +
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'PRIVATE' },
            { type: 'text', text: 'Deploying now.' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      }) +
      line({
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', content: 'tool output' }] },
      }),
  );
  const speech = await readSpeech('claude', file);
  expect(speech.user?.text).toContain('Deploy with');
  expect(speech.user?.at).toBe(Date.parse('2026-10-04T11:00:00Z'));
  expect(speech.assistant).toEqual({ text: 'Deploying now.', at: null });
  expect(JSON.stringify(speech)).not.toMatch(/SECRETVALUE|PRIVATE|tool output/);
});

it('cuts long text on a character boundary and re-reads only when the file changed', async () => {
  const file = await transcript(user('😀'.repeat(500)) + reply('one'));
  const first = await readSpeech('claude', file);
  const chars = Array.from(first.user!.text);
  expect(chars).toHaveLength(401);
  expect(chars.slice(0, 400).every((c) => c === '😀')).toBe(true);
  expect(chars[400]).toBe('…');
  expect(await readSpeech('claude', file)).toBe(first); // cached: the same object
  await appendFile(file, reply('two'));
  expect((await readSpeech('claude', file)).assistant?.text).toBe('two');
});

it('never cuts a reply inside a Markdown construct, and redacts before it cuts', async () => {
  const long = `${'word '.repeat(70)}**${'bold '.repeat(20)}end** and \`code\`\n\`\`\`sh\n${'ls -la\n'.repeat(60)}\`\`\``;
  const file = await transcript(
    reply(`api_key=SECRETVALUE ${long}`) +
      reply(`${'x'.repeat(390)} [docs](https://example.com/a/b)`),
  );
  const first = await readSpeech('claude', file);
  expect(first.assistant?.text).toMatch(/…$/);
  expect(first.assistant?.text).not.toContain('SECRETVALUE');
  expect(first.assistant?.text).toMatch(/\*\*$|…`$|…$/);
  const text = first.assistant!.text;
  expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0);
  expect((text.match(/```/g) ?? []).length % 2).toBe(0);
  // The second reply is the latest: its link is cut inside the address, so only its label survives.
  await appendFile(
    file,
    reply(`${'y'.repeat(385)} [the docs](https://example.com/very/long/address)`),
  );
  const cut = (await readSpeech('claude', file)).assistant!.text;
  expect(cut).not.toMatch(/\]\(|https:\/\/example\.com\/very/);
});

it('speaks only for running sessions the scanner found', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-speech-home-'));
  const dir = join(home, '.claude/projects/-p');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'sess-7.jsonl'),
    line({ type: 'user', cwd: home, message: { role: 'user', content: 'hello' } }) + reply('hi'),
  );
  resetLocalSessionCache();
  resetSpeechCache();
  await scanLocalSessions(home, Date.now(), 0);
  const some = (key: string, process: LocalSession['process']) =>
    ({ key, process }) as LocalSession;
  expect(
    await runningSpeech([some('claude:sess-7', 'none'), some('claude:ghost', 'running')]),
  ).toEqual({});
  const speech = await runningSpeech([some('claude:sess-7', 'running')]);
  expect(speech['claude:sess-7']?.user?.text).toBe('hello');
  expect(speech['claude:sess-7']?.assistant?.text).toBe('hi');
});

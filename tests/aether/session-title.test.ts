import { expect, it } from 'vitest';
import {
  parseClaudeTitle,
  parseCodexIndex,
} from '../../apps/control/src/services/sessions/session-title.js';

it('takes the latest Claude ai-title and nothing else from the transcript', () => {
  const tail = [
    '{"cut',
    JSON.stringify({ type: 'ai-title', aiTitle: 'Old title', sessionId: 's' }),
    JSON.stringify({ type: 'user', message: { content: 'PRIVATE PROMPT' } }),
    JSON.stringify({ type: 'ai-title', aiTitle: '  Fix   the\nlogin   flow ', sessionId: 's' }),
  ].join('\n');
  expect(parseClaudeTitle(tail)).toBe('Fix the login flow');
  expect(parseClaudeTitle('{"type":"user"}')).toBeNull();
  expect(
    parseClaudeTitle(JSON.stringify({ type: 'ai-title', aiTitle: 'x'.repeat(500) })),
  ).toHaveLength(120);
});

it('maps Codex thread ids to names, the last entry winning and junk ignored', () => {
  const names = parseCodexIndex(
    [
      JSON.stringify({ id: 'a', thread_name: 'First', updated_at: 'x' }),
      'not json',
      JSON.stringify({ id: 'a', thread_name: 'Renamed' }),
      JSON.stringify({ id: 'b', thread_name: '   ' }),
      JSON.stringify({ thread_name: 'no id' }),
    ].join('\n'),
  );
  expect([...names]).toEqual([['a', 'Renamed']]);
});

it('cleans a title: markup, entities, unbalanced brackets and invisible characters', () => {
  const title = (aiTitle: string) =>
    parseClaudeTitle(JSON.stringify({ type: 'ai-title', aiTitle }));
  expect(title('<span class="a">Fix &amp; ship</span>')).toBe('Fix & ship');
  expect(title('【審查邊界（擁有者 10-05')).toBe('【審查邊界】');
  expect(title('a​b‮c')).toBe('abc');
  const names = parseCodexIndex(JSON.stringify({ id: 'a', thread_name: '「未完成的 (標題' }));
  expect(names.get('a')).toBe('「未完成的」');
});

import { describe, expect, it } from 'vitest';
import {
  neutralizeHtml,
  stripCliWrappers,
  structureWrappers,
} from '../../packages/kernel/src/index.js';

const TASK = [
  '<task-notification>',
  '<task-id>b3k9x2</task-id>',
  '<tool-use-id>toolu_01ABCdef</tool-use-id>',
  '<output-file>/tmp/tasks/b3k9x2.output</output-file>',
  '<status>completed</status>',
  '<summary>Background command "pnpm test" completed (exit code 0)</summary>',
  '</task-notification>',
].join('\n');

// [name, input, expected text after structureWrappers]
const TEXT: [string, string, string][] = [
  // wrappers that must never reach the screen
  ['the reported task notification, alone', TASK, ''],
  ['a stray task-notification closer', '</task-notification>', ''],
  ['a stray div closer', 'done </div>', 'done'],
  ['a stray unknown closer', 'a</foo>b', 'a b'],
  ['stray closers around text', '</result> text </status>', 'text'],
  ['unknown balanced pair keeps its text', '<note>read this</note>', 'read this'],
  ['hyphenated pair', '<my-tag>inner</my-tag>', 'inner'],
  ['underscore pair', '<tool_uses>3</tool_uses>', '3'],
  ['namespaced pair', '<invoke name="x">body</invoke>', 'body'],
  ['namespaced lone opener at line start', '<my-wrap>\nreason', 'reason'],
  ['function_results', '<function_results>ok</function_results>', 'ok'],
  ['nested unknown wrappers', '<a-b><c-d>x</c-d></a-b>', 'x'],
  ['siblings are not glued', '<k-a>one</k-a><k-b>two</k-b>', 'one two'],
  ['unclosed hyphenated opener alone on its line', '<some-wrapper>\ntext here', 'text here'],
  ['unclosed hyphenated opener ending a line', 'Result: <some-wrapper>\ntext', 'Result:\ntext'],
  ['hyphenated opener with attributes', 'see <my-tag id="1"> here', 'see here'],
  ['self-closing hyphenated tag', 'a <my-tag/> b', 'a b'],
  ['option tags in prose', '<option>one</option><option>two</option>', 'one two'],
  ['entry and root', '<root><entry>x</entry></root>', 'x'],
  ['usage block', '<usage>tokens</usage>', 'tokens'],
  ['mixed case', '<My-Tag>x</MY-TAG>', 'x'],
  ['tag with a newline inside attributes', '<my-tag\n a="1">x</my-tag>', 'x'],
  ['wrappers around a markdown list', '<result>\n- one\n- two\n</result>', '- one\n- two'],
  ['wrappers around a heading', '<summary-x>\n# Title\n</summary-x>', '# Title'],
  ['wrapper next to punctuation', 'wait <my-tag>now</my-tag>.', 'wait now.'],
  ['wrapper inside a sentence', 'it was <em-x>very</em-x> good', 'it was very good'],
  ['cjk inside a wrapper', '<結果>完成</結果> 好', '<結果>完成</結果> 好'],
  ['cjk text with a stray closer', '完成了</result>。', '完成了。'],
  ['cjk next to wrapper', '你好<my-tag>世界</my-tag>！', '你好世界！'],
  ['html and wrappers together', '<div><my-tag>x</my-tag></div>', 'x'],
  ['span with wrapper', '<span class="a"><b-x>y</b-x></span>', 'y'],
  ['stray closers after markdown', '**bold** </result>', '**bold**'],
  ['two stray closers', '</a-b></c-d>', ''],
  ['a closer glued to a word', 'word</my-tag>', 'word'],
  ['an unbalanced opener is kept in mid-sentence', 'run <your-key> now', 'run <your-key> now'],
  ['placeholder with underscore mid-line', 'set <api_key> first', 'set <api_key> first'],
  ['single word placeholder', 'use <file> here', 'use <file> here'],
  ['balanced placeholder pair is a wrapper', 'use <file>a.ts</file> here', 'use a.ts here'],
  // generics and comparisons survive
  ['Array<string>', 'type Array<string>', 'type Array<string>'],
  ['Map<K, V>', 'Map<K, V> is a map', 'Map<K, V> is a map'],
  ['std::vector<int>', 'use std::vector<int> here', 'use std::vector<int> here'],
  ['Promise<void>', 'returns Promise<void>', 'returns Promise<void>'],
  ['a<b>c', 'a<b>c', 'a<b>c'],
  ['trailing comma generic', 'fn foo<T,>(x: T)', 'fn foo<T,>(x: T)'],
  ['nested generics', 'List<Map<String, Int>>', 'List<Map<String, Int>>'],
  ['Vec<u8> and Option<String>', 'Vec<u8> and Option<String>', 'Vec<u8> and Option<String>'],
  ['Result with underscore', 'Result<my_type>', 'Result<my_type>'],
  ['generic with a dash', 'Box<my-type>', 'Box<my-type>'],
  ['comparison', 'if x < 3 and y > 2', 'if x < 3 and y > 2'],
  ['arrow', 'a => b < c', 'a => b < c'],
  ['bare angle brackets', '<> and </>', '<> and </>'],
  ['an email in brackets', 'mail <me@example.com>', 'mail <me@example.com>'],
  ['a url in brackets', 'see <https://example.com/a>', 'see <https://example.com/a>'],
  ['a shell redirect', 'cat <in.txt >out.txt', 'cat <in.txt >out.txt'],
  ['an inline code span with a tag', 'use `<div>x</div>` here', 'use `<div>x</div>` here'],
  [
    'inline code with a closer',
    'type `</task-notification>` to close',
    'type `</task-notification>` to close',
  ],
  ['double-tick span', 'x ``<a-b>c</a-b>`` y', 'x ``<a-b>c</a-b>`` y'],
  ['br survives in code', 'write `<br/>` for a break', 'write `<br/>` for a break'],
  [
    'fence keeps wrappers',
    '```xml\n<task-notification>x</task-notification>\n```',
    '```xml\n<task-notification>x</task-notification>\n```',
  ],
  [
    'fence keeps jsx',
    '```tsx\nconst a = <Button onClick={f}>go</Button>;\n```',
    '```tsx\nconst a = <Button onClick={f}>go</Button>;\n```',
  ],
  ['tilde fence keeps tags', '~~~\n</div>\n~~~', '~~~\n</div>\n~~~'],
  ['wrapper outside, fence inside', '<my-tag>\n```\n</div>\n```\n</my-tag>', '```\n</div>\n```'],
  ['unclosed fence keeps tags', '```\n<a-b>x</a-b>', '```\n<a-b>x</a-b>'],
  ['four-tick fence keeps tags', '````\n```\n</div>\n````', '````\n```\n</div>\n````'],
  ['text around a fence', 'a</div>\n```\n</div>\n```\nb</div>', 'a\n```\n</div>\n```\nb'],
  [
    'a stray block closer keeps the paragraph',
    'A stray closer </div> must not show.',
    'A stray closer must not show.',
  ],
  ['a matched div still breaks the paragraph', 'a<div>b</div>c', 'a\n\nb\n\nc'],
  // mixed with markdown
  ['bold around wrappers', '**a** <my-tag>b</my-tag> *c*', '**a** b *c*'],
  ['a link and a wrapper', '[x](https://a.dev) <my-tag>y</my-tag>', '[x](https://a.dev) y'],
  [
    'a table with wrappers',
    '| a | b |\n|---|---|\n| <x-y>1</x-y> | 2 |',
    '| a | b |\n|---|---|\n| 1 | 2 |',
  ],
  ['a quote with a closer', '> quoted </div>', '> quoted'],
  ['empty wrapper', 'a<my-tag></my-tag>b', 'a b'],
  ['whitespace-only wrapper', '<my-tag>  </my-tag>', ''],
  ['entities inside a wrapper', '<my-tag>a &amp; b</my-tag>', 'a & b'],
  ['escaped angle stays text', 'a \\<my-tag\\> b', 'a \\<my-tag\\> b'],
  ['lt entity is text', '&lt;my-tag&gt;', '\\<my-tag>'],
  ['plain text', 'nothing here', 'nothing here'],
  ['empty', '', ''],
  ['only whitespace', '  \n ', ''],
  ['a lone angle', 'a < b', 'a < b'],
  ['unicode spacing', 'a <my-tag>b</my-tag>', 'a b'],
  ['thinking is dropped', '<thinking>hidden</thinking>answer', 'answer'],
  ['caveat is dropped', '<local-command-caveat>Caveat: do not</local-command-caveat>ok', 'ok'],
  [
    'memory citation is dropped',
    'done\n<oai-mem-citation><citation_entries>a</citation_entries><rollout_ids>b</rollout_ids></oai-mem-citation>',
    'done',
  ],
  ['unclosed memory citation is dropped to the end', 'done <oai-mem-citation>x', 'done'],
  ['interrupt marker', '[Request interrupted by user]', ''],
  ['interrupt marker for tool use', '[Request interrupted by user for tool use]', ''],
  ['bracket text is kept', '[not an interrupt] hello', '[not an interrupt] hello'],
  ['deeply nested unknown', '<a-1>'.repeat(30) + 'x' + '</a-1>'.repeat(30), 'x'],
  ['many sibling wrappers', '<k-a>1</k-a>'.repeat(5), '1 1 1 1 1'],
  [
    'output of a command in a sentence',
    'ran <local-command-stdout>ok</local-command-stdout> fine',
    'ran  fine',
  ],
];

describe('structureWrappers: text', () => {
  it.each(TEXT)('%s', (_name, input, expected) => {
    expect(structureWrappers(input).text).toBe(expected);
  });

  it('is idempotent on the whole corpus', () => {
    for (const [, input] of TEXT) {
      const once = structureWrappers(input).text;
      expect(structureWrappers(once).text, input).toBe(once);
      expect(neutralizeHtml(once), input).toBe(once);
    }
  });

  it('leaves no closing tag of a wrapper outside code', () => {
    const outside = (t: string) => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const [name, input] of TEXT) {
      if (
        /inline code|fence|span|escaped|entity|lt entity|generic|Array|Map|Vec|List|Result|Box/i.test(
          name,
        )
      )
        continue;
      expect(outside(structureWrappers(input).text), name).not.toMatch(/<\/[A-Za-z]/);
    }
  });
});

describe('structureWrappers: notices', () => {
  it('turns the reported task notification into a task notice without ids or paths', () => {
    const { text, notices } = structureWrappers(`${TASK}\nthen continue`);
    expect(text).toBe('then continue');
    expect(notices).toEqual([
      {
        kind: 'task',
        status: 'completed',
        summary: 'Background command "pnpm test" completed (exit code 0)',
        exitCode: 0,
        detail: '',
      },
    ]);
    expect(JSON.stringify(notices)).not.toMatch(/b3k9x2|toolu_|\/tmp\/tasks/);
  });

  it('reads a failed exit code and the result detail', () => {
    const { notices } = structureWrappers(
      '<task-notification><status>failed</status><summary>Background command "x" failed with exit code 2</summary><result>boom</result></task-notification>',
    );
    expect(notices[0]).toMatchObject({ status: 'failed', exitCode: 2, detail: 'boom' });
  });

  it('keeps a task notice with no summary readable', () => {
    const { notices } = structureWrappers(
      '<task-notification><status>killed</status></task-notification>',
    );
    expect(notices).toEqual([
      { kind: 'task', status: 'killed', summary: '', exitCode: null, detail: '' },
    ]);
  });

  it('handles an unclosed task notification', () => {
    const { text, notices } = structureWrappers(
      '<task-notification><status>completed</status><summary>cut off',
    );
    expect(text).toBe('');
    expect(notices).toHaveLength(1);
  });

  it('combines a slash command and its arguments', () => {
    const { text, notices } = structureWrappers(
      '<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>PR 12</command-args>',
    );
    expect(text).toBe('');
    expect(notices).toEqual([{ kind: 'command', name: '/review', args: 'PR 12' }]);
  });

  it('reads a command with no arguments', () => {
    const { notices } = structureWrappers(
      '<command-name>/compact</command-name><command-message>compact</command-message><command-args></command-args>',
    );
    expect(notices).toEqual([{ kind: 'command', name: '/compact', args: '' }]);
  });

  it('collapses local command output and removes terminal colors', () => {
    const { notices } = structureWrappers(
      '<local-command-stdout>\u001b[1mCompacted\u001b[0m</local-command-stdout>',
    );
    expect(notices).toEqual([{ kind: 'output', text: 'Compacted', error: false }]);
    const err = structureWrappers('<local-command-stderr>bad</local-command-stderr>').notices;
    expect(err).toEqual([{ kind: 'output', text: 'bad', error: true }]);
  });

  it('turns a system reminder into a context notice with sanitized text', () => {
    const { text, notices } = structureWrappers(
      'hi\n<system-reminder>Use <b>care</b>\n<cwd>/repo</cwd></system-reminder>',
    );
    expect(text).toBe('hi');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'context', label: 'system' });
    const body = (notices[0] as { text: string }).text;
    expect(body).toContain('cwd: /repo');
    expect(body).not.toMatch(/<\/?[a-z]/i);
  });

  it('labels environment, ide and instruction context', () => {
    const labels = (s: string) =>
      structureWrappers(s).notices.map((n) => (n.kind === 'context' ? n.label : n.kind));
    expect(labels('<environment_context><cwd>/x</cwd></environment_context>')).toEqual([
      'environment',
    ]);
    expect(labels('<ide_opened_file>The user opened a.ts</ide_opened_file>')).toEqual(['ide']);
    expect(labels('<user_instructions>be nice</user_instructions>')).toEqual(['instructions']);
    expect(labels('<a-b>x</a-b>')).toEqual([]);
  });

  it('turns hook feedback into a hook notice', () => {
    const { notices } = structureWrappers(
      '<user-prompt-submit-hook>blocked: no secrets</user-prompt-submit-hook>',
    );
    expect(notices).toEqual([{ kind: 'hook', text: 'blocked: no secrets' }]);
  });

  it('turns an aborted turn and the interrupt marker into an interrupted notice', () => {
    expect(structureWrappers('<turn_aborted>user</turn_aborted>').notices).toEqual([
      { kind: 'interrupted' },
    ]);
    expect(structureWrappers('[Request interrupted by user]').notices).toEqual([
      { kind: 'interrupted' },
    ]);
  });

  it('does not read wrappers in code', () => {
    const input =
      'type `<system-reminder>x</system-reminder>` and\n```\n<task-notification>y</task-notification>\n```';
    const { text, notices } = structureWrappers(input);
    expect(notices).toEqual([]);
    expect(text).toBe(input);
  });

  it('keeps several notices in order and the words around them', () => {
    const { text, notices } = structureWrappers(
      `<system-reminder>a</system-reminder>\nHello\n${TASK}\n<user-prompt-submit-hook>h</user-prompt-submit-hook>`,
    );
    expect(text).toBe('Hello');
    expect(notices.map((n) => n.kind)).toEqual(['context', 'task', 'hook']);
  });

  it('bounds the number of notices', () => {
    const many = '<system-reminder>x</system-reminder>'.repeat(200);
    expect(structureWrappers(many).notices.length).toBeLessThanOrEqual(40);
  });

  it('is idempotent on its text', () => {
    const { text } = structureWrappers(`${TASK}\nkeep <my-tag>this</my-tag>`);
    expect(structureWrappers(text)).toEqual({ text, notices: [] });
  });
});

describe('stripCliWrappers (plain text for titles and bubbles)', () => {
  it('keeps a command as typed and drops task, context and hook notices', () => {
    expect(stripCliWrappers(TASK)).toBe('');
    expect(
      stripCliWrappers('<command-name>/review</command-name><command-args>PR 1</command-args>'),
    ).toBe('/review PR 1');
    expect(stripCliWrappers('<local-command-stdout>Done</local-command-stdout>')).toBe('Done');
    expect(stripCliWrappers('<system-reminder>x</system-reminder>y')).toBe('y');
  });
});

describe('wrapper pipeline: hostile input stays linear', () => {
  const MB = 1_000_000;
  const cases: [string, string][] = [
    ['open angles', '<'.repeat(MB)],
    ['open tags', '<a-b '.repeat(MB / 5)],
    ['many hyphenated openers', '<a-b>'.repeat(MB / 5)],
    ['many closers', '</a-b>'.repeat(MB / 6)],
    ['unclosed reminders', '<system-reminder>'.repeat(MB / 17)],
    ['reminders with other closers', '<system-reminder>x</task-notification>'.repeat(MB / 38)],
    ['hyphen chain', '<' + 'a-'.repeat(MB / 2)],
    ['hook-like chain', '<' + 'a-a-'.repeat(MB / 4) + '>'],
    ['backticks', '`'.repeat(MB)],
    ['alternating ticks', '`` `'.repeat(MB / 4)],
    ['tick-wrapped tags', '`<a-b>` '.repeat(MB / 8)],
    ['long attribute', '<my-tag ' + 'a="b" '.repeat(MB / 6) + '>'],
    ['one long line of tags', 'x<a-b>y</a-b>'.repeat(MB / 13)],
    ['spaces then tag', ' '.repeat(MB) + '<a-b>'],
    ['fences', '```\n'.repeat(MB / 4)],
    ['commands', '<command-name>'.repeat(MB / 14)],
    ['entities', '&#x;'.repeat(MB / 4)],
    ['cut tags', '<span a=1 '.repeat(MB / 10)],
    ['nested bold', '<b>'.repeat(MB / 3)],
    ['code pairs', '<code>x</code>'.repeat(MB / 14)],
    ['bold pairs', '<b>x</b>'.repeat(MB / 8)],
    ['links', '<a href="https://x.dev">y</a>'.repeat(MB / 28)],
    ['list items', '<ul><li>a</li></ul>'.repeat(MB / 19)],
    ['line breaks', 'a<br>'.repeat(MB / 5)],
    ['generics', 'Map<K, V> a<b>c '.repeat(MB / 17)],
  ];
  it.each(cases)('%s', (_name, input) => {
    const started = performance.now();
    const out = structureWrappers(input);
    stripCliWrappers(input);
    expect(typeof out.text).toBe('string');
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

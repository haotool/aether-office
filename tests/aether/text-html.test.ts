import { describe, expect, it } from 'vitest';
import {
  neutralizeHtml,
  stripCliWrappers,
  parseInline,
  spansText,
} from '../../packages/kernel/src/index.js';

const REPORTED =
  '<span class="tx">confirm-rate 的有效設定除了 decision off→on，也包含 R4 false→true，不能僅憑 diff 將數字變化歸因於 decision。</span>';
const REPORTED_CLEAN =
  'confirm-rate 的有效設定除了 decision off→on，也包含 R4 false→true，不能僅憑 diff 將數字變化歸因於 decision。';

// [name, input, expected]
const CASES: [string, string, string][] = [
  ['the reported span with a class', REPORTED, REPORTED_CLEAN],
  ['span with several attributes', '<span class="a" style="color:red" data-x=1>hi</span>', 'hi'],
  ['nested wrappers', '<div><p><span>deep</span></p></div>', 'deep'],
  ['uppercase tags', '<SPAN CLASS="x">up</SPAN>', 'up'],
  ['br', 'a<br>b<br/>c<br />d', 'a\nb\nc\nd'],
  ['paragraphs', '<p>one</p><p>two</p>', 'one\n\ntwo'],
  ['div blocks', '<div>one</div><div>two</div>', 'one\n\ntwo'],
  ['hr', 'a<hr>b', 'a\n\n---\n\nb'],
  ['heading', '<h2>Title</h2>text', '## Title\n\ntext'],
  ['heading level 4', '<h4>Small</h4>', '#### Small'],
  ['bold', 'x <b>bold</b> y', 'x **bold** y'],
  ['strong', '<strong>s</strong>', '**s**'],
  ['italic and em', '<i>a</i> <em>b</em>', '*a* *b*'],
  ['strike', '<del>gone</del> <s>old</s>', '~~gone~~ ~~old~~'],
  ['emphasis padded with spaces', 'a <b> pad </b>b', 'a  **pad** b'],
  ['empty emphasis', 'a <b></b>b', 'a b'],
  ['unclosed bold closes at the end', '<b>never closed', '**never closed**'],
  ['stray closing tag', 'a</b>b</span>', 'ab'],
  ['link keeps its text and url', '<a href="https://x.dev/a">docs</a>', '[docs](https://x.dev/a)'],
  [
    'link with entities in the url',
    '<a href="https://x.dev/?a=1&amp;b=2">q</a>',
    '[q](https://x.dev/?a=1&b=2)',
  ],
  ['javascript link is its text', '<a href="javascript:alert(1)">bad</a>', 'bad'],
  ['link without href', '<a name="top">anchor</a>', 'anchor'],
  ['link whose text is the url', '<a href="https://x.dev">https://x.dev</a>', 'https://x.dev'],
  ['link without text', '<a href="https://x.dev"></a>', 'https://x.dev'],
  [
    'url with a closing parenthesis',
    '<a href="https://x.dev/a)b">t</a>',
    '[t](https://x.dev/a%29b)',
  ],
  ['attribute value containing >', '<div class="a>b">x</div>', 'x'],
  ['single-quoted attribute', "<a href='https://x.dev'>s</a>", '[s](https://x.dev)'],
  ['inline code', 'use <code>npm i</code> now', 'use `npm i` now'],
  ['inline code with entities', '<code>a &lt; b</code>', '`a < b`'],
  ['inline code holding a backtick', '<code>a`b</code>', '``a`b``'],
  ['code with inner tags', '<code><b>x</b></code>', '`x`'],
  ['pre becomes a fence', '<pre>line 1\nline 2</pre>', '```\nline 1\nline 2\n```'],
  [
    'pre with a language',
    '<pre><code class="language-ts">const a: Array&lt;string&gt; = [];\n</code></pre>',
    '```ts\nconst a: Array<string> = [];\n```',
  ],
  ['unordered list', '<ul><li>one</li><li>two</li></ul>', '- one\n- two'],
  ['ordered list', '<ol><li>a</li><li>b</li></ol>', '1. a\n2. b'],
  ['nested list', '<ul><li>a<ul><li>b</li></ul></li></ul>', '- a\n\n  - b'],
  ['li without a list', '<li>x</li>', '- x'],
  [
    'table',
    '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
  ],
  [
    'table with thead and tbody',
    '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    '| A |\n| --- |\n| 1 |',
  ],
  ['table pipe is escaped', '<table><tr><td>a|b</td></tr></table>', '| a\\|b |\n| --- |'],
  [
    'table with ragged rows',
    '<table><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></table>',
    '| 1 | 2 |\n| --- | --- |\n| 3 |  |',
  ],
  [
    'table cell with markup',
    '<table><tr><td><b>x</b><br>y</td></tr></table>',
    '| **x** y |\n| --- |',
  ],
  [
    'details and summary',
    '<details><summary>More</summary>body text</details>',
    '#### More\n\nbody text',
  ],
  ['image becomes its alt text', '<img src="x.png" alt="logo">', 'logo'],
  ['image without alt', 'a<img src="x.png">b', 'ab'],
  ['comment', 'x<!-- hidden -->y', 'xy'],
  ['unclosed comment', 'x<!-- never closed', 'x'],
  ['script is dropped with its content', 'a<script>alert(1)</script>b', 'ab'],
  ['style is dropped with its content', 'a<style>p{color:red}</style>b', 'ab'],
  ['unclosed script drops the rest', 'a<script>alert(1)', 'a'],
  ['blockquote', '<blockquote>quoted</blockquote>', '> quoted'],
  ['font and small', '<font color="red">a</font><small>b</small>', 'ab'],
  ['sub and sup', 'H<sub>2</sub>O x<sup>2</sup>', 'H2O x2'],
  ['center', '<center>mid</center>', 'mid'],
  ['unterminated tag with attributes', 'before <span class="tx" ', 'before'],
  ['unterminated tag on the last line', 'ok\n<a href="https://x', 'ok'],
  ['named entities', 'a&nbsp;b &amp; c &quot;q&quot; &apos;', 'a b & c "q" \''],
  ['numeric entities', '&#39;q&#39; &#x41; &#65;', "'q' A A"],
  ['lt and gt are escaped, never a tag', '&lt;div&gt;x&lt;/div&gt;', '\\<div>x\\</div>'],
  ['double encoded stays single decoded', '&amp;lt;b&amp;gt;', '&amp;lt;b&amp;gt;'],
  ['unknown entity is text', 'a &unknown; b', 'a &unknown; b'],
  ['entity that decodes to a control is dropped', 'a&#0;b&#7;c', 'abc'],
  ['entity that decodes to a backtick is escaped', '&#96;x&#96;', '\\`x\\`'],
  ['ampersand alone', 'AT&T and a & b', 'AT&T and a & b'],
  ['generic Array<string>', 'Array<string> of Map<K, V>', 'Array<string> of Map<K, V>'],
  ['generic with single-letter parameter', 'List<a> and Foo<b>', 'List<a> and Foo<b>'],
  ['comparison', 'a < b and c > d and x<5', 'a < b and c > d and x<5'],
  ['x<y>z', 'x<y>z and 1<2>0', 'x<y>z and 1<2>0'],
  ['template literal types', 'Promise<Record<string, number>>', 'Promise<Record<string, number>>'],
  ['an unknown balanced pair is a wrapper', '<unknown>keep</unknown>', 'keep'],
  ['an unknown lone tag is text', '<unknown>keep', '<unknown>keep'],
  ['bare angle brackets', '<> and < > and <3', '<> and < > and <3'],
  [
    'inline code is protected',
    '`<span>x</span>` and `Array<b>`',
    '`<span>x</span>` and `Array<b>`',
  ],
  ['double-tick code is protected', '``<div>&amp;``', '``<div>&amp;``'],
  [
    'fenced block is protected',
    'a\n```html\n<div class="x">&nbsp;</div>\n```\n<b>after</b>',
    'a\n```html\n<div class="x">&nbsp;</div>\n```\n**after**',
  ],
  ['tilde fence is protected', '~~~\n<br>\n~~~', '~~~\n<br>\n~~~'],
  ['unclosed fence protects to the end', '```\n<p>open', '```\n<p>open'],
  [
    'blank lines in a fence survive',
    '<b>x</b>\n```\na\n\n\n\nb\n```',
    '**x**\n```\na\n\n\n\nb\n```',
  ],
  ['escaped angle bracket stays', '\\<div>x', '\\<div>x'],
  [
    'markdown is untouched',
    '**bold** and _it_ and [l](https://x.dev)',
    '**bold** and _it_ and [l](https://x.dev)',
  ],
  ['CJK with a wrapper', '<p>請確認 <b>設定</b> 是否正確。</p>', '請確認 **設定** 是否正確。'],
  ['emoji survive', '<span>🚀 shipped 👨‍👩‍👧‍👦</span>', '🚀 shipped 👨‍👩‍👧‍👦'],
  ['many blank lines collapse', '<p>a</p><p></p><p></p><p>b</p>', 'a\n\nb'],
  ['trailing spaces before a newline go', 'a   <br>b', 'a\nb'],
  ['plain text is returned as it is', 'nothing to do', 'nothing to do'],
  ['empty string', '', ''],
];

describe('neutralizeHtml corpus', () => {
  it.each(CASES)('%s', (_name, input, expected) => {
    expect(neutralizeHtml(input)).toBe(expected);
  });

  it('has at least sixty cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });
});

const ALLOWED_TAG =
  /<\/?(span|div|p|br|a|b|i|em|strong|code|pre|table|tr|td|th|ul|ol|li|details|summary|img|h[1-6]|script|style|font|center|sub|sup|blockquote)(\s[^<>]*)?\/?>/i;

/** Strips code spans and fences, the only places an allowlisted tag may remain. */
const withoutCode = (text: string) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

describe('neutralizeHtml properties', () => {
  const inputs = [
    ...CASES.map((c) => c[1]),
    REPORTED + ' ' + REPORTED,
    '<div><span>' + '<b>'.repeat(50),
  ];

  it('is idempotent', () => {
    for (const input of inputs) {
      const once = neutralizeHtml(input);
      expect(neutralizeHtml(once), input).toBe(once);
    }
  });

  it('leaves no allowlisted tag outside code', () => {
    const tagged = inputs.filter(
      (i) => !i.includes('`') && !i.includes('~~~') && !i.includes('\\<'),
    );
    for (const input of tagged) {
      const out = withoutCode(neutralizeHtml(input));
      // Generic-looking text (Array<b>) is deliberately kept; everything else must be gone.
      if (/[A-Za-z0-9_]<[a-z]>/.test(input) || /&(lt|amp)/.test(input)) continue;
      expect(ALLOWED_TAG.test(out), `${input} -> ${out}`).toBe(false);
    }
  });

  it('never throws or hangs on hostile input', () => {
    const hostile = [
      '<'.repeat(5000),
      '<a href="'.repeat(2000),
      '<table>' + '<tr><td>'.repeat(2000),
      '`'.repeat(3001) + '<b>',
      '<!--'.repeat(2000),
      '&'.repeat(5000) + '#x;',
      '<span '.repeat(3000),
    ];
    const started = Date.now();
    for (const text of hostile) expect(typeof neutralizeHtml(text)).toBe('string');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('keeps a lone backslash that ends the text', () => {
    expect(neutralizeHtml('<b>x</b>\\')).toBe('**x**\\');
    expect(neutralizeHtml('a &amp; b\\')).toBe('a & b\\');
  });

  it('is never raw HTML for the renderer: the inline parser shows only text', () => {
    const out = neutralizeHtml(
      '<a href="https://x.dev" onclick="x()">go</a> &lt;img src=x onerror=1&gt;',
    );
    const spans = parseInline(out);
    expect(spansText(spans)).toBe('go <img src=x onerror=1>');
    expect(spans.find((s) => s.text === 'go')?.href).toBe('https://x.dev');
  });
});

describe('stripCliWrappers', () => {
  const CASES2: [string, string, string][] = [
    [
      'system reminder is dropped with its content',
      'hi <system-reminder>secret rules</system-reminder> there',
      'hi  there',
    ],
    ['unclosed reminder drops the rest', 'hi <system-reminder>never closed', 'hi'],
    ['thinking is dropped', '<thinking>hidden</thinking>answer', 'answer'],
    ['think is dropped', '<think>hidden</think>answer', 'answer'],
    ['hook output is dropped', '<user-prompt-submit-hook>ctx</user-prompt-submit-hook>go', 'go'],
    [
      'environment context is dropped',
      '<environment_context>\n<cwd>/x</cwd>\n</environment_context>',
      '',
    ],
    [
      'task notification is dropped',
      '<task-notification><summary>done</summary></task-notification>',
      '',
    ],
    [
      'a slash command is the command as typed',
      '<command-name>/compact</command-name><command-message>compact</command-message><command-args></command-args>',
      '/compact',
    ],
    [
      'a slash command keeps its arguments',
      '<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>PR 12</command-args>',
      '/review PR 12',
    ],
    [
      'command output keeps its text',
      '<local-command-stdout>Compacted</local-command-stdout>',
      'Compacted',
    ],
    ['the caveat is dropped', '<local-command-caveat>do not answer</local-command-caveat>', ''],
    ['ordinary text is untouched', 'compare a < b', 'compare a < b'],
  ];
  it.each(CASES2)('%s', (_name, input, expected) => {
    expect(stripCliWrappers(input)).toBe(expected);
  });
});

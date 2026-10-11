import { describe, expect, it } from 'vitest';
import {
  countWords,
  cutMarkdown,
  graphemes,
  parseInline,
  revealWords,
  toInlineSegments,
  toPlainPreview,
} from '../../packages/kernel/src/index.js';

const REPLY = [
  '收斂清理已派給… **我已做的（只動分支與暫存，不動程式碼）：**',
  '- 已移除 16 個 `fix/stale-chunk-blank-page` 分支',
  '- 第二項 [連結](https://example.com/a)',
].join('\n');

const CORPUS = [
  REPLY,
  '# Heading one\n\n## Two\n\nSome **bold**, *italic*, ~~gone~~ and `code`.',
  '1. first\n2. second\n   - nested `a`\n   - nested **b**\n3. third',
  '- [x] done\n- [ ] todo with [a link](https://a.test/x?y=1)',
  '| name | value |\n|------|-------|\n| `a` | **1** |\n| b | 2 |',
  '> quoted **text**\n> second line\n\n---\n\nafter the rule',
  '```ts\nconst answer = 42;\n```\n\nand then ![a chart](https://evil.test/p.png) shown',
  'Unclosed **bold and [link](http://exa',
  'dangling `code and more',
  '<b>html</b> <br> <!-- hidden --> text <script>alert(1)</script>',
  '***both*** and __strong__ and _em_ plus \\*literal\\*',
  'See https://example.com/docs, and (https://example.com/x).',
  '```\nnever closed\nsecond',
  '![](x.png) [empty]() [js](javascript:alert(1))',
];
const SYNTAX = [
  /\*\*/,
  /```/,
  /^\s*#{1,6}\s/m,
  /\[[^\]]*\]\(/,
  /~~/,
  /^\s*[-*+]\s/m,
  /^\s*>\s/m,
  /!\[/,
  /<\/?b>/,
];

describe('toPlainPreview', () => {
  it('keeps the words of the reported reply and drops its syntax', () => {
    expect(toPlainPreview(REPLY)).toBe(
      '收斂清理已派給… 我已做的（只動分支與暫存，不動程式碼）： 已移除 16 個 fix/stale-chunk-blank-page 分支 · 第二項 連結',
    );
  });

  it('gives bullet lines when more than one line is asked for', () => {
    expect(toPlainPreview(REPLY, { maxLines: 4 })).toBe(
      '收斂清理已派給… 我已做的（只動分支與暫存，不動程式碼）：\n• 已移除 16 個 fix/stale-chunk-blank-page 分支\n• 第二項 連結',
    );
    expect(toPlainPreview('1. a\n2. b\n   - c\n- [x] d', { maxLines: 9 })).toBe(
      '1. a\n2. b\n  • c\n☑ d',
    );
  });

  it('turns headings, fences, tables and rules into text', () => {
    expect(toPlainPreview('# Title\n\nbody')).toBe('Title · body');
    expect(toPlainPreview('```js\nrun();\n```', { maxLines: 2 })).toBe('‹run();›');
    expect(toPlainPreview('```\n```', { maxLines: 2 })).toBe('‹code›');
    expect(toPlainPreview('| a | b |\n|---|---|\n| 1 | 2 |', { maxLines: 5 })).toBe('a · b\n1 · 2');
    expect(toPlainPreview('one\n\n---\n\ntwo', { maxLines: 5 })).toBe('one\ntwo');
  });

  it('shows image alt text, link labels and no unsafe address', () => {
    expect(toPlainPreview('![a chart](https://x.test/p.png) and [js](javascript:alert(1))')).toBe(
      'a chart and js',
    );
  });

  it('drops known HTML tags and comments but keeps other angle brackets', () => {
    expect(toPlainPreview('<b>hi</b><br>there <!-- c --> Array<string>')).toBe(
      'hi there Array<string>',
    );
  });

  it.each(CORPUS)('leaves no syntax in the preview of %j', (sample) => {
    for (const options of [{}, { maxLines: 6 }, { maxChars: 30 }, { maxChars: 60, maxLines: 3 }]) {
      const text = toPlainPreview(sample, options);
      for (const pattern of SYNTAX) expect(text, `${pattern} in ${text}`).not.toMatch(pattern);
    }
  });

  it('cuts to maxChars including the ellipsis, on whole characters', () => {
    const text = toPlainPreview('龍'.repeat(50), { maxChars: 10 });
    expect(Array.from(text)).toHaveLength(10);
    expect(text.endsWith('…')).toBe(true);
    const emoji = toPlainPreview('😀👨‍👩‍👧‍👦'.repeat(10), { maxChars: 5 });
    expect(graphemes(emoji)).toHaveLength(5);
    expect(emoji).not.toMatch(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/,
    );
    expect(toPlainPreview('short', { maxChars: 5 })).toBe('short');
    expect(toPlainPreview('', { maxChars: 5 })).toBe('');
  });

  it('marks what the line limit dropped', () => {
    expect(toPlainPreview('a\n\nb\n\nc', { maxLines: 2 })).toBe('a\nb…');
  });

  it('handles a huge input without reading all of it', () => {
    const big = `**${'word '.repeat(50_000)}`;
    expect(toPlainPreview(big, { maxChars: 40 })).toHaveLength(40);
  });
});

describe('toInlineSegments', () => {
  it('keeps bold, code and link text as runs without markers', () => {
    const [line] = toInlineSegments('**bold** and `code` and [text](https://a.test) end');
    expect(line!.spans).toEqual([
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'code', code: true },
      { text: ' and ' },
      { text: 'text', href: 'https://a.test' },
      { text: ' end' },
    ]);
  });

  it('gives bullets a marker and depth, headings a kind, code its first line', () => {
    const lines = toInlineSegments('# H\n- a\n  - b\n```\nx\ny\n```');
    expect(lines.map((l) => [l.kind, l.marker, l.depth])).toEqual([
      ['heading', undefined, 0],
      ['bullet', '•', 0],
      ['bullet', '•', 1],
      ['code', undefined, 0],
    ]);
    expect(lines[3]!.spans).toEqual([{ text: 'x', code: true }]);
  });

  it('clips the runs, keeping their style', () => {
    const lines = toInlineSegments('**abcdefghij** tail', { maxChars: 6 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.spans).toEqual([{ text: 'abcde', bold: true }, { text: '…' }]);
  });
});

describe('words', () => {
  it('counts and reveals English and Chinese by word', () => {
    const lines = toInlineSegments('Fix the **build** now');
    expect(countWords(lines)).toBe(4);
    const shown = revealWords(lines, 2);
    expect(shown[0]!.spans.map((s) => s.text).join('')).toBe('Fix the ');
    expect(countWords(toInlineSegments('收斂清理已派給'))).toBeGreaterThan(1);
    expect(revealWords(lines, 0)).toEqual([]);
    expect(revealWords(lines, 99)).toEqual(lines);
  });
});

describe('cutMarkdown', () => {
  it('returns text that fits unchanged', () => {
    expect(cutMarkdown('**ok**', 20)).toBe('**ok**');
  });

  it('never ends inside a word, a surrogate pair or an emoji', () => {
    expect(cutMarkdown('alpha beta gamma delta', 13)).toBe('alpha beta…');
    const cut = cutMarkdown('👨‍👩‍👧‍👦'.repeat(20), 3);
    expect(graphemes(cut.slice(0, -1))).toHaveLength(3);
  });

  it('closes a dangling fence, code span and emphasis', () => {
    expect(cutMarkdown('intro\n```ts\nconst longValue = 1;\nmore', 28)).toMatch(/\n```$/);
    expect(cutMarkdown('run `npm run build` then deploy', 12)).toMatch(/…`$/);
    expect(cutMarkdown('**我已做的（只動分支與暫存，不動程式碼）：**', 8)).toMatch(/…\*\*$/);
    expect(cutMarkdown('~~old text that is long~~', 10)).toMatch(/…~~$/);
  });

  it('keeps only the label of an unfinished link', () => {
    expect(cutMarkdown('go [the docs](https://example.com/very/long/path) now', 30)).toBe(
      'go the docs…',
    );
    expect(cutMarkdown('go [the docs and more words here](https://e.test)', 20)).toBe(
      'go the docs and…',
    );
  });

  it('drops a table that was cut before its delimiter row, and keeps one that is whole enough', () => {
    const table = 'intro\n\n| file | change |\n|------|--------|\n| a | b |\n| c | d |';
    expect(cutMarkdown(`${table}\n\nafter`, 26)).toBe('intro…');
    expect(cutMarkdown(`${table}\n\nafter`, 21)).toBe('intro…');
    expect(cutMarkdown(`${table}\n\nafter`, 56)).toMatch(/\| a \| b \|\n\| c…$/);
  });

  it('is stable: cutting twice changes nothing', () => {
    const once = cutMarkdown(REPLY.repeat(4), 60);
    expect(cutMarkdown(once, 60)).toBe(once);
  });
});

describe('parseInline', () => {
  it('nests emphasis and merges runs of the same style', () => {
    expect(parseInline('**a *b* c**')).toEqual([
      { text: 'a ', bold: true },
      { text: 'b', bold: true, italic: true },
      { text: ' c', bold: true },
    ]);
    expect(parseInline('plain **x**')).toEqual([{ text: 'plain ' }, { text: 'x', bold: true }]);
  });

  it('treats arithmetic stars and snake_case as text', () => {
    expect(parseInline('2 * 3 * 4 and snake_case_name')).toEqual([
      { text: '2 * 3 * 4 and snake_case_name' },
    ]);
  });

  it('respects bracket depth in link labels and drops cut-off destinations', () => {
    expect(parseInline('[outer [inner](http://a.test) tail](http://b.test/x)')).toEqual([
      { text: 'outer ', href: 'http://b.test/x' },
      { text: 'inner', href: 'http://a.test' },
      { text: ' tail', href: 'http://b.test/x' },
    ]);
    expect(parseInline('[a](<http://c.test/path> "title")')).toEqual([
      { text: 'a', href: 'http://c.test/path' },
    ]);
  });

  it('only links http and https', () => {
    expect(
      parseInline(
        '[a](http://x.test) [b](HTTPS://y.test/z) [c](javascript:alert(1)) [d](data:text/html,x) [e](//x.test)',
      ),
    ).toEqual([
      { text: 'a', href: 'http://x.test' },
      { text: ' ' },
      { text: 'b', href: 'HTTPS://y.test/z' },
      { text: ' c d e' },
    ]);
  });

  it('links bare addresses without their trailing punctuation', () => {
    expect(parseInline('visit https://a.test/x, then (https://b.test/y).')).toEqual([
      { text: 'visit ' },
      { text: 'https://a.test/x', href: 'https://a.test/x' },
      { text: ', then (' },
      { text: 'https://b.test/y', href: 'https://b.test/y' },
      { text: ').' },
    ]);
  });
});

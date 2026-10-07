import { expect, it } from 'vitest';
import { parseMarkdown } from '../../packages/kernel/src/index.js';

const types = (md: string) => parseMarkdown(md).map((b) => b.type);

it('reads headings with their level, and a closing hash run is not text', () => {
  expect(parseMarkdown('# One\n### Three ###')).toEqual([
    { type: 'heading', level: 1, inline: [{ text: 'One' }] },
    { type: 'heading', level: 3, inline: [{ text: 'Three' }] },
  ]);
});

it('keeps single line breaks in a paragraph, so CJK lines are not joined by a space', () => {
  expect(parseMarkdown('第一行\n第二行\n\nnext')[0]).toEqual({
    type: 'paragraph',
    inline: [{ text: '第一行\n第二行' }],
  });
});

it('nests lists by indentation, mixing bullets and numbers, with task state', () => {
  const [list] = parseMarkdown(
    '- a\n  1. one\n  2. two\n     - deep\n- [x] done\n- [ ] todo\n\n- after a blank line',
  );
  if (list?.type !== 'list') throw new Error('list expected');
  expect(list.ordered).toBe(false);
  expect(list.items).toHaveLength(4);
  expect(list.items[0]!.blocks[1]).toMatchObject({ type: 'list', ordered: true, start: 1 });
  expect(list.items.map((i) => i.checked)).toEqual([null, true, false, null]);
});

it('starts a list straight after a paragraph line and ends it at the next paragraph', () => {
  expect(types('intro:\n- a\n- b\n\nouter')).toEqual(['paragraph', 'list', 'paragraph']);
  expect(parseMarkdown('3. c\n4. d')[0]).toMatchObject({ ordered: true, start: 3 });
});

it('reads tables with alignment, escaped pipes and short rows', () => {
  const [table] = parseMarkdown('| a | b | c |\n|:--|:-:|--:|\n| 1 \\| x | **2** |\n\nafter');
  if (table?.type !== 'table') throw new Error('table expected');
  expect(table.align).toEqual(['left', 'center', 'right']);
  expect(table.head.map((c) => c[0]!.text)).toEqual(['a', 'b', 'c']);
  expect(table.rows[0]).toEqual([[{ text: '1 | x' }], [{ text: '2', bold: true }], []]);
  expect(types('a | b\nnot a table')).toEqual(['paragraph']);
});

it('reads quotes (with blocks inside), rules and fences with their language', () => {
  expect(types('> a\n> - b\n\n---\n***\n```py\nx\n```')).toEqual(['quote', 'rule', 'rule', 'code']);
  expect(parseMarkdown('> a\n> - b')[0]).toMatchObject({
    type: 'quote',
    blocks: [{ type: 'paragraph' }, { type: 'list' }],
  });
});

it('runs an unclosed fence to the end and honours ~~~ and longer fences', () => {
  expect(parseMarkdown('```ts\nconst a = 1;\nmore')[0]).toEqual({
    type: 'code',
    text: 'const a = 1;\nmore',
    lang: 'ts',
  });
  expect(parseMarkdown('````md\n```\ninner\n```\n````')[0]).toMatchObject({
    text: '```\ninner\n```',
  });
  expect(types('~~~\nx\n~~~\ntext')).toEqual(['code', 'paragraph']);
});

it('never produces HTML: markup stays text or is dropped, links are http(s) only', () => {
  const json = JSON.stringify(
    parseMarkdown('<img src=x onerror=alert(1)> <script>x</script> [a](javascript:1)'),
  );
  expect(json).not.toContain('javascript');
  expect(json).not.toContain('href');
  // A script element is dropped with its content, an image becomes its (absent) alt text.
  expect(json).not.toContain('<script');
  expect(json).not.toContain('onerror');
});

it('handles mixed emphasis, code containing markers and escapes', () => {
  expect(parseMarkdown('**bold `a*b*c` still** and \\# not a heading')[0]).toEqual({
    type: 'paragraph',
    inline: [
      { text: 'bold ', bold: true },
      { text: 'a*b*c', code: true, bold: true },
      { text: ' still', bold: true },
      { text: ' and # not a heading' },
    ],
  });
});

it('ends a paragraph at each block start and lets an unclosed fence or a table run to the end', () => {
  expect(types('text\n# h\nmore\n- item\nlast\n> q\n---\n| a |\n|---|\n| 1 |\n| 2 |')).toEqual([
    'paragraph',
    'heading',
    'paragraph',
    'list',
    'paragraph',
    'quote',
    'rule',
    'table',
  ]);
  expect(parseMarkdown('~~~sh\nls\n```\n')).toEqual([
    { type: 'code', text: 'ls\n```\n', lang: 'sh' },
  ]);
});

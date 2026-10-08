import { expect, it } from 'vitest';
import {
  diffKind,
  isDiff,
  parseMarkdown,
} from '../../apps/web/src/features/conversation/md-parse.js';

it('keeps the language of a fenced block, and none when it has none', () => {
  const [ts, plain] = parseMarkdown('```ts\nconst a = 1;\n```\n\n```\nraw\n```');
  expect(ts).toEqual({ type: 'code', text: 'const a = 1;', lang: 'ts' });
  expect(plain).toEqual({ type: 'code', text: 'raw' });
});

it('classifies the lines of a unified diff', () => {
  expect(
    ['@@ -1,2 +1,2 @@', '+new', '-old', ' same', '+++ b/a.ts', '--- a/a.ts'].map(diffKind),
  ).toEqual(['hunk', 'add', 'del', 'ctx', 'ctx', 'ctx']);
  expect([isDiff('diff'), isDiff('patch'), isDiff('ts'), isDiff(undefined)]).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

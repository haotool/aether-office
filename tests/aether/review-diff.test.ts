import { expect, it } from 'vitest';
import { commentStatus, parseDiff } from '../../packages/kernel/src/index.js';

const diff = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' keep',
  '-old',
  '+new',
  '+extra',
  '@@ -10,1 +11,1 @@ fn',
  '-x',
  '+y',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-bye',
  'diff --git a/img.png b/img.png',
  'Binary files a/img.png and b/img.png differ',
].join('\n');

it('extracts hunks per file, including deletions, and skips binary files', () => {
  const hunks = parseDiff(diff);
  expect(hunks.map((h) => [h.path, h.header])).toEqual([
    ['src/a.ts', '@@ -1,2 +1,3 @@'],
    ['src/a.ts', '@@ -10,1 +11,1 @@ fn'],
    ['gone.ts', '@@ -1 +0,0 @@'],
  ]);
  expect(hunks[0]!.body).toBe(' keep\n-old\n+new\n+extra');
});

it('classifies comments against a moved head', () => {
  const c = { headSha: 'a', path: 'src/a.ts', hunkHash: 'h1' };
  expect(commentStatus(c, 'a', null)).toBe('current');
  expect(commentStatus(c, 'b', null)).toBe('unknown');
  expect(commentStatus(c, 'b', [{ path: 'src/a.ts', hash: 'h1' }])).toBe('carried');
  expect(commentStatus(c, 'b', [{ path: 'src/a.ts', hash: 'h2' }])).toBe('stale');
  expect(commentStatus(c, 'b', [{ path: 'other.ts', hash: 'h1' }])).toBe('stale');
});

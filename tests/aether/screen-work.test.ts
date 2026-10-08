import { expect, it } from 'vitest';
import { hashText } from '../../packages/office-scene/src/environment/hash.js';
import { elapsedLabel, kindOf } from '../../packages/office-scene/src/screen/screen-work.js';

it('sorts a tool call into the kind of work its row is drawn as', () => {
  const kind = (tool: string, target: string | null = null) => kindOf({ tool, target });
  expect(kind('Edit', 'app.ts')).toBe('edit');
  expect(kind('Write')).toBe('edit');
  expect(kind('Read', 'a.md')).toBe('read');
  expect(kind('Bash', 'ls')).toBe('shell');
  expect(kind('Bash', 'git push')).toBe('git');
  expect(kind('Bash', 'pnpm test')).toBe('test');
  expect(kind('Bash', 'vitest')).toBe('test');
  expect(kind('Bash')).toBe('shell');
  expect(kind('Grep')).toBe('search');
  expect(kind('WebFetch', 'docs.example.com')).toBe('web');
  expect(kind('mcp__x__y')).toBe('other');
});

it('hashes a name the same way every time and tells how long ago in whole units', () => {
  expect(hashText('app.ts')).toBe(hashText('app.ts'));
  expect(hashText('app.ts')).not.toBe(hashText('main.ts'));
  expect([0, 59_999, 60_000, 3_599_000, 7_200_000].map(elapsedLabel)).toEqual([
    '0s',
    '59s',
    '1m',
    '59m',
    '2h',
  ]);
});

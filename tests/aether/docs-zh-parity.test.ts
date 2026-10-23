import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const commands = (text: string) =>
  [...text.matchAll(/^ *```[^\n]*\n[\s\S]*?^ *```$/gm)].map((m) => m[0].replace(/^ +/gm, ''));
const headings = (text: string) => text.match(/^#{2,3} /gm)?.length;

it('keeps the Chinese getting-started guide in step with the English one: same commands, same sections', () => {
  const en = read('docs/getting-started.md');
  const zh = read('docs/getting-started.zh-TW.md');
  expect(commands(zh)).toEqual(commands(en));
  expect(headings(zh)).toBe(headings(en));
});

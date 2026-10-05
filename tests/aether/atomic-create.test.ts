import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createFileOnce } from '../../apps/runner/src/atomic.js';

it('creates a file whole, with its mode, and refuses to replace one that exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
  const file = join(dir, 'a.json');
  createFileOnce(file, '{"a":1}', 0o600);
  expect(readFileSync(file, 'utf8')).toBe('{"a":1}');
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(() => createFileOnce(file, '{"a":2}', 0o600)).toThrow(/EEXIST/);
  expect(readFileSync(file, 'utf8')).toBe('{"a":1}'); // untouched
  expect(readdirSync(dir)).toEqual(['a.json']); // no temporary file left behind, even after the refusal
});

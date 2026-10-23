import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { rotateLog } from '../../apps/control/src/log-rotation.js';

it('moves an oversized log to .1 and empties it in place, keeping one older generation', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'aether-log-')), 'control.log');
  writeFileSync(file, 'first '.repeat(10));
  expect(rotateLog(file, 100)).toBe(false);
  expect(readFileSync(file, 'utf8')).toBe('first '.repeat(10));

  expect(rotateLog(file, 50)).toBe(true);
  expect(readFileSync(file, 'utf8')).toBe('');
  expect(readFileSync(`${file}.1`, 'utf8')).toBe('first '.repeat(10));

  writeFileSync(file, 'second '.repeat(10));
  expect(rotateLog(file, 50)).toBe(true);
  expect(readFileSync(`${file}.1`, 'utf8')).toBe('second '.repeat(10));
});

it('leaves a log that does not exist alone', () => {
  expect(rotateLog(join(tmpdir(), 'aether-no-such-log', 'control.log'), 1)).toBe(false);
});

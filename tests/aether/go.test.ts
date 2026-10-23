import { expect, it } from 'vitest';
import { openCommand } from '../../scripts/go.js';
import { parsePort } from '../../scripts/ports.js';

const url = 'http://127.0.0.1:4310/#pair=abc';

it('opens the link with BROWSER, else open on macOS and xdg-open on Linux, and nowhere else', () => {
  expect(openCommand(url, 'darwin', {})).toEqual(['open', [url]]);
  expect(openCommand(url, 'linux', {})).toEqual(['xdg-open', [url]]);
  expect(openCommand(url, 'win32', {})).toBeNull();
  expect(openCommand(url, 'darwin', { BROWSER: 'firefox' })).toEqual(['firefox', [url]]);
  expect(openCommand(url, 'darwin', { BROWSER: 'none' })).toBeNull();
});

it('takes a whole-number port from 1024 up to the limit, 4310 when unset', () => {
  expect(parsePort(undefined)).toBe(4310);
  expect(parsePort('4400')).toBe(4400);
  expect(parsePort('65535')).toBe(65535);
  expect(parsePort('65535', 65534)).toBeNull();
  for (const bad of ['', '80', '1023', '70000', '4310.5', 'abc', '-1'])
    expect(parsePort(bad), bad).toBeNull();
});

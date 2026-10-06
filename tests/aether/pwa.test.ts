import { expect, it } from 'vitest';
import { precacheUrls, shellVersion } from '../../scripts/sw-precache.ts';
import { cacheName, handling } from '../../apps/web/src/sw/cache-rules.js';
import { isIos, installHint } from '../../apps/web/src/install-prompt.js';
import { canRegister, switchedOff } from '../../apps/web/src/pwa.js';

const ORIGIN = 'http://127.0.0.1:4310';
const request = (path: string, mode = 'no-cors', method = 'GET') => ({
  method,
  mode,
  url: ORIGIN + path,
});

it('precaches the page and the hashed scripts and styles, nothing else', () => {
  const urls = precacheUrls([
    'index.html',
    'sw.js',
    'manifest.webmanifest',
    'icon-192.png',
    'assets/index-DrhTULmU.css',
    'assets/animals/fox-lod2.glb',
    'assets/Terminals-BADMLKfy.js',
    'assets/Terminals-BADMLKfy.js.br',
    'assets/index-T73xHO0C.js.map',
  ]);
  expect(urls).toEqual([
    '/index.html',
    '/assets/Terminals-BADMLKfy.js',
    '/assets/index-DrhTULmU.css',
  ]);
  expect(precacheUrls(['assets\\a-12345678.js'])).toEqual(['/index.html', '/assets/a-12345678.js']);
});

it('names the cache after a version that changes with any file', () => {
  const urls = ['/index.html', '/assets/a-12345678.js'];
  const version = shellVersion(urls, '<html>1</html>');
  expect(version).toMatch(/^[0-9a-f]{12}$/);
  expect(shellVersion(urls, '<html>1</html>')).toBe(version);
  expect(shellVersion(urls, '<html>2</html>')).not.toBe(version);
  expect(shellVersion([...urls, '/assets/b-12345678.css'], '<html>1</html>')).not.toBe(version);
  expect(cacheName(version)).toBe(`aether-shell-${version}`);
});

it('answers only the page and hashed files, and never an API response', () => {
  expect(handling(request('/assets/index-DrhTULmU.js'), ORIGIN)).toBe('asset');
  expect(handling(request('/office', 'navigate'), ORIGIN)).toBe('navigation');
  for (const path of [
    '/api/local-sessions',
    '/api/projects/p/stream',
    '/health',
    '/assets/animals/fox-lod2.glb',
    '/icon-192.png',
    '/sw.js',
  ])
    expect(handling(request(path), ORIGIN), path).toBe('network');
  // a navigation to an API address, a write, and another origin are all left alone
  expect(handling(request('/api/export', 'navigate'), ORIGIN)).toBe('network');
  expect(handling(request('/assets/index-DrhTULmU.js', 'no-cors', 'POST'), ORIGIN)).toBe('network');
  expect(
    handling(
      { method: 'GET', mode: 'no-cors', url: 'https://example.com/assets/a-12345678.js' },
      ORIGIN,
    ),
  ).toBe('network');
});

it('registers only in a secure production page that has not been switched off', () => {
  const ok = { secure: true, supported: true, production: true, disabled: false };
  expect(canRegister(ok)).toBe(true);
  expect(canRegister({ ...ok, secure: false })).toBe(false); // http://192.168.x.x
  expect(canRegister({ ...ok, supported: false })).toBe(false);
  expect(canRegister({ ...ok, production: false })).toBe(false);
  expect(canRegister({ ...ok, disabled: true })).toBe(false);
});

it('the kill switch sticks until it is turned back on', () => {
  const data = new Map<string, string>();
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  expect(switchedOff('', store)).toBe(false);
  expect(switchedOff('?sw=off', store)).toBe(true);
  expect(switchedOff('', store)).toBe(true);
  expect(switchedOff('?sw=on', store)).toBe(false);
  expect(switchedOff('', store)).toBe(false);
  expect(
    switchedOff('?sw=off', {
      ...store,
      setItem: () => {
        throw new Error('blocked');
      },
    }),
  ).toBe(false);
});

it('shows the install button where the browser has one and the Share steps only on iOS', () => {
  const base = { canPrompt: false, ios: false, standalone: false, dismissed: false };
  expect(installHint(base)).toBeNull();
  expect(installHint({ ...base, canPrompt: true })).toBe('prompt');
  expect(installHint({ ...base, ios: true })).toBe('ios');
  expect(installHint({ ...base, ios: true, standalone: true })).toBeNull();
  expect(installHint({ ...base, canPrompt: true, dismissed: true })).toBeNull();
});

it('recognizes an iPhone and an iPad that pretends to be a Mac', () => {
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  expect(isIos(safari, 5)).toBe(true);
  expect(isIos(mac, 5)).toBe(true);
  expect(isIos(mac, 0)).toBe(false);
  expect(isIos('Mozilla/5.0 (Linux; Android 14) Chrome/130', 5)).toBe(false);
});

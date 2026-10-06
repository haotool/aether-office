import { expect, it } from 'vitest';
import { isChunkLoadError, mayReloadForChunk } from '../../apps/web/src/root-boundary.js';

it('recognises a chunk that failed to load in Chrome, Safari and Firefox', () => {
  for (const m of [
    'Failed to fetch dynamically imported module: http://x/assets/a.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: http://x/assets/a.js',
  ])
    expect(isChunkLoadError(new TypeError(m))).toBe(true);
  expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
    false,
  );
});

it('reloads for a missing chunk once per window, never in a loop, never without storage', () => {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  expect(mayReloadForChunk(store, 100_000)).toBe(true);
  expect(mayReloadForChunk(store, 105_000)).toBe(false);
  expect(mayReloadForChunk(store, 111_000)).toBe(true);
  const blocked = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => undefined,
  };
  expect(mayReloadForChunk(blocked, 1)).toBe(false);
});

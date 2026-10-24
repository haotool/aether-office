import { describe, expect, it } from 'vitest';
import { liteRows } from '../../apps/web/src/features/lite/lite-rows.js';

const NOW = 10_000_000;
type Sessions = NonNullable<Parameters<typeof liteRows>[0]>;
const session = (key: string, mtime: number, process: 'running' | 'none' = 'running') =>
  ({ key, mtime, process, hook: null }) as unknown as Sessions[number];
const ask = (key: string) => ({ key, label: key, since: NOW, detail: '' });

describe('liteRows', () => {
  it('puts whoever asks first, in ask order, then the rest newest first', () => {
    const rows = liteRows(
      [session('a', NOW - 1_000), session('b', NOW - 2_000), session('c', NOW - 3_000)],
      [ask('c'), ask('b')],
      NOW,
    );
    expect(rows.map((r) => [r.session.key, r.asking])).toEqual([
      ['c', true],
      ['b', true],
      ['a', false],
    ]);
  });

  it('drops sessions that are gone unless they ask', () => {
    const gone = session('gone', NOW - 10 * 3_600_000, 'none');
    expect(liteRows([gone], [], NOW)).toEqual([]);
    expect(liteRows([gone], [ask('gone')], NOW)).toHaveLength(1);
  });

  it('is empty before the sessions arrive', () => {
    expect(liteRows(undefined, [], NOW)).toEqual([]);
  });
});

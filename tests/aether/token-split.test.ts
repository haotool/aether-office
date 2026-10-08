import { expect, it } from 'vitest';
import { tokensByDepartment } from '../../apps/web/src/lib/sessions/localSessions.js';

const s = (department: string, freshTokens: number | null) =>
  ({ usage: { freshTokens }, classification: { department } }) as never;

it('sums tokens per department, largest first, skipping sessions without usage', () => {
  expect(
    tokensByDepartment([s('quality', 10), s('product', 50), s('quality', 5), s('data', null)]),
  ).toEqual([
    { department: 'product', tokens: 50, sessions: 1 },
    { department: 'quality', tokens: 15, sessions: 2 },
  ]);
});

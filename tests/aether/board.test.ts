import { expect, it } from 'vitest';
import { workStateSchema } from '../../packages/contracts/src/index.js';
import { boardStates } from '../../apps/web/src/features/board.js';

it('puts every work state in exactly one board column', () => {
  expect([...boardStates].sort()).toEqual([...workStateSchema.options].sort());
});

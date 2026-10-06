import { expect, it } from 'vitest';
import { chipText } from '../../apps/web/src/features/model-chip.js';

const opus = {
  id: 'claude-opus-5-5',
  label: 'Opus 5.5',
  efforts: ['low', 'medium'],
  isAlias: false,
};

it('writes the chip as the model name, then the effort when one is chosen', () => {
  expect(chipText(opus)).toBe('Opus 5.5');
  expect(chipText(opus, 'medium')).toBe('Opus 5.5 · medium');
});

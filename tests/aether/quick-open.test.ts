import { expect, it } from 'vitest';
import { matchItems } from '../../apps/web/src/features/operations/quick-match.js';

const item = (label: string, hint = '') => ({ id: label, label, hint, to: `/${label}` });

it('matches every word against label and hint, label prefixes first', () => {
  const items = [item('Reviews'), item('fix login', 'accounting review'), item('Tasks')];
  expect(matchItems(items, 'rev').map((i) => i.label)).toEqual(['Reviews', 'fix login']);
  expect(matchItems(items, 'login review').map((i) => i.label)).toEqual(['fix login']);
  expect(matchItems(items, '')).toHaveLength(3);
});

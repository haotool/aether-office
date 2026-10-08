import { expect, it } from 'vitest';
import { contextLabel } from '../../apps/web/src/features/sessions/context-label.js';
import { translate } from '../../apps/web/src/lib/i18n/i18n.js';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

it('says when the window a context gauge is measured against is a guess, and stays plain when it is not', () => {
  const pct = { contextPct: 45 } as const;
  expect(
    contextLabel({ ...pct, contextWindow: 200_000, contextWindowBasis: 'observed' }, t, 'en'),
  ).toBe('Context 45%');
  expect(
    contextLabel({ ...pct, contextWindow: 200_000, contextWindowBasis: 'assumed' }, t, 'en'),
  ).toBe('Context 45% · window assumed: 200K');
  expect(
    contextLabel(
      { contextPct: 25, contextWindow: 1_000_000, contextWindowBasis: 'inferred' },
      t,
      'en',
    ),
  ).toBe('Context 25% · window inferred (the context is past 200k): 1M');
  // An older control plane sends no basis: the label is the plain one, never a made-up claim.
  expect(contextLabel({ ...pct, contextWindow: 200_000 }, t, 'en')).toBe('Context 45%');
  expect(
    contextLabel({ contextPct: null, contextWindow: null, contextWindowBasis: null }, t, 'en'),
  ).toBeNull();
});

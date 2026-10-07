import { describe, expect, it } from 'vitest';
import { parseVerifiers, parseVerifyOutcome } from '../../apps/web/src/features/review-model.js';

describe('review model', () => {
  it('reads the verifiers of a loaded workspace and none otherwise', () => {
    expect(parseVerifiers(undefined)).toEqual([]);
    expect(parseVerifiers('[{"name":"unit","sourceHash":"abc"}]')).toEqual([
      { name: 'unit', sourceHash: 'abc' },
    ]);
  });

  it('reads a verify outcome, and null while there is no result', () => {
    expect(parseVerifyOutcome(null)).toBeNull();
    expect(parseVerifyOutcome(undefined)).toBeNull();
    expect(parseVerifyOutcome('')).toBeNull();
    expect(parseVerifyOutcome('{"error":"boom"}')).toEqual({ error: 'boom' });
  });
});
